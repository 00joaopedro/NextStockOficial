import { randomUUID, createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingEventType,
  BillingSubscriptionOperationState,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingEntitlementService } from './billing-entitlement.service';
import { BillingEventsService } from './billing-events.service';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';

export const TRIAL_DAYS = 7;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: BillingEntitlementService,
    private readonly events: BillingEventsService,
    private readonly gateways?: PaymentGatewayRegistry,
  ) {}

  async getForTenant(tenantId: string) {
    const entitlement = await this.entitlement.forTenant(tenantId);
    return {
      subscription: this.format(entitlement.subscription),
      entitlement: {
        allowed: entitlement.allowed,
        reason: entitlement.reason,
        redirectTo: entitlement.redirectTo,
      },
      enforcementEnabled:
        process.env.BILLING_ENFORCEMENT_ENABLED?.toLowerCase() === 'true',
      trialDaysRemaining: this.daysRemaining(
        entitlement.subscription?.trialEndsAt,
      ),
    };
  }

  async createTrial(
    tx: Prisma.TransactionClient,
    tenantId: string,
    startedAt = new Date(),
  ) {
    const trialEndsAt = new Date(
      startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
    );
    const subscription = await tx.subscription.create({
      data: {
        tenantId,
        status: SubscriptionStatus.trialing,
        trialStartedAt: startedAt,
        trialEndsAt,
      },
    });
    await this.events.create(
      {
        tenantId,
        subscriptionId: subscription.id,
        type: BillingEventType.TRIAL_STARTED,
        source: 'registration',
        nextState: {
          status: subscription.status,
          trialStartedAt: startedAt.toISOString(),
          trialEndsAt: trialEndsAt.toISOString(),
        },
      },
      tx,
    );
    return subscription;
  }

  async cancelForTenant(tenantId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription)
      throw new NotFoundException('Subscription não encontrada.');

    const existingOperation =
      await this.prisma.billingSubscriptionOperation.findUnique({
        where: {
          tenantId_subscriptionId_operation: {
            tenantId,
            subscriptionId: subscription.id,
            operation: 'CANCEL',
          },
        },
      });

    if (subscription.status === SubscriptionStatus.canceled) {
      if (
        existingOperation &&
        existingOperation.state !== BillingSubscriptionOperationState.SUCCEEDED
      ) {
        await this.prisma.billingSubscriptionOperation.updateMany({
          where: {
            id: existingOperation.id,
            state: { not: BillingSubscriptionOperationState.SUCCEEDED },
          },
          data: {
            state: BillingSubscriptionOperationState.SUCCEEDED,
            claimToken: null,
            completedAt: new Date(),
            failureCode: null,
          },
        });
      }
      return this.format(subscription);
    }

    if (!subscription.gatewaySubscriptionId) {
      const updated = await this.prisma.subscription.updateMany({
        where: {
          id: subscription.id,
          tenantId,
          version: subscription.version,
          status: { not: SubscriptionStatus.canceled },
        },
        data: {
          status: SubscriptionStatus.canceled,
          cancelAtPeriodEnd: false,
          canceledAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        const current = await this.prisma.subscription.findUniqueOrThrow({
          where: { id: subscription.id },
        });
        if (current.status === SubscriptionStatus.canceled)
          return this.format(current);
        throw new ConflictException(
          'A assinatura foi alterada por outra operação.',
        );
      }
      const current = await this.prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      await this.events.create({
        tenantId,
        subscriptionId: current.id,
        type: BillingEventType.SUBSCRIPTION_CANCELED,
        source: 'api',
        previousState: { status: subscription.status },
        nextState: { status: current.status },
      });
      return this.format(current);
    }

    if (!this.gateways || !subscription.gatewayProvider) {
      throw new ConflictException('Gateway da assinatura não está disponível.');
    }

    const gateway = this.gateways.get(subscription.gatewayProvider);
    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(Date.now() + 60_000);
    let operation:
      | { id: string; claimToken: string | null; state: BillingSubscriptionOperationState }
      | undefined;

    if (!existingOperation) {
      try {
        operation = await this.prisma.billingSubscriptionOperation.create({
          data: {
            tenantId,
            subscriptionId: subscription.id,
            provider: subscription.gatewayProvider,
            operation: 'CANCEL',
            claimToken,
            leaseExpiresAt,
            state: BillingSubscriptionOperationState.CLAIMED,
          },
          select: { id: true, claimToken: true, state: true },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
      }
    }

    if (!operation) {
      const currentOperation =
        existingOperation ??
        (await this.prisma.billingSubscriptionOperation.findUniqueOrThrow({
          where: {
            tenantId_subscriptionId_operation: {
              tenantId,
              subscriptionId: subscription.id,
              operation: 'CANCEL',
            },
          },
        }));
      if (
        currentOperation.state === BillingSubscriptionOperationState.SUCCEEDED
      ) {
        const reconciled = await this.prisma.subscription.updateMany({
          where: {
            id: subscription.id,
            tenantId,
            version: subscription.version,
            status: { not: SubscriptionStatus.canceled },
          },
          data: {
            status: SubscriptionStatus.canceled,
            cancelAtPeriodEnd: false,
            canceledAt: new Date(),
            version: { increment: 1 },
          },
        });
        const current = await this.prisma.subscription.findUniqueOrThrow({
          where: { id: subscription.id },
        });
        if (reconciled.count === 1) {
          await this.events.create({
            tenantId,
            subscriptionId: current.id,
            type: BillingEventType.SUBSCRIPTION_CANCELED,
            source: 'reconciliation',
            previousState: { status: subscription.status },
            nextState: { status: current.status },
          });
        }
        return this.format(current);
      }
      if (currentOperation.leaseExpiresAt > new Date()) {
        throw new ConflictException(
          'Cancelamento já está em processamento; não será feita uma segunda chamada ao gateway.',
        );
      }
      const reclaimed = await this.prisma.billingSubscriptionOperation.updateMany({
        where: {
          id: currentOperation.id,
          claimToken: currentOperation.claimToken,
          state: {
            in: [
              BillingSubscriptionOperationState.CLAIMED,
              BillingSubscriptionOperationState.PROCESSING,
              BillingSubscriptionOperationState.UNKNOWN,
              BillingSubscriptionOperationState.FAILED_RETRYABLE,
            ],
          },
          leaseExpiresAt: { lte: new Date() },
        },
        data: {
          state: BillingSubscriptionOperationState.CLAIMED,
          claimToken,
          leaseExpiresAt,
          failureCode: null,
        },
      });
      if (reclaimed.count !== 1) {
        throw new ConflictException(
          'Claim de cancelamento expirou ou foi substituído.',
        );
      }
      operation = {
        id: currentOperation.id,
        claimToken,
        state: BillingSubscriptionOperationState.CLAIMED,
      };
    }

    const processing = await this.prisma.billingSubscriptionOperation.updateMany({
      where: {
        id: operation.id,
        claimToken,
        state: BillingSubscriptionOperationState.CLAIMED,
      },
      data: {
        state: BillingSubscriptionOperationState.PROCESSING,
      },
    });
    if (processing.count !== 1) {
      throw new ConflictException(
        'Claim de cancelamento expirou ou foi substituído.',
      );
    }

    const gatewayIdempotencyKey = createHash('sha256')
      .update(
        `${tenantId}:CANCEL_SUBSCRIPTION:${subscription.id}:${operation.id}`,
      )
      .digest('hex');

    try {
      await gateway.cancelSubscription(
        subscription.gatewaySubscriptionId,
        gatewayIdempotencyKey,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        const current = await tx.subscription.findUniqueOrThrow({
          where: { id: subscription.id },
        });
        if (current.status === SubscriptionStatus.canceled) {
          await tx.billingSubscriptionOperation.updateMany({
            where: {
              id: operation!.id,
              claimToken,
              state: BillingSubscriptionOperationState.PROCESSING,
            },
            data: {
              state: BillingSubscriptionOperationState.SUCCEEDED,
              claimToken: null,
              completedAt: new Date(),
              failureCode: null,
            },
          });
          return current;
        }

        const updated = await tx.subscription.updateMany({
          where: {
            id: subscription.id,
            tenantId,
            version: current.version,
            status: { not: SubscriptionStatus.canceled },
          },
          data: {
            status: SubscriptionStatus.canceled,
            cancelAtPeriodEnd: false,
            canceledAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            'A assinatura foi alterada por outra operação.',
          );

        const next = await tx.subscription.findUniqueOrThrow({
          where: { id: subscription.id },
        });
        const completed = await tx.billingSubscriptionOperation.updateMany({
          where: {
            id: operation!.id,
            claimToken,
            state: BillingSubscriptionOperationState.PROCESSING,
          },
          data: {
            state: BillingSubscriptionOperationState.SUCCEEDED,
            claimToken: null,
            completedAt: new Date(),
            failureCode: null,
          },
        });
        if (completed.count !== 1)
          throw new ConflictException(
            'Claim de cancelamento expirou após a confirmação.',
          );

        await this.events.create(
          {
            tenantId,
            subscriptionId: next.id,
            type: BillingEventType.SUBSCRIPTION_CANCELED,
            source: 'api',
            previousState: { status: current.status },
            nextState: { status: next.status },
          },
          tx,
        );
        return next;
      });
      return this.format(result);
    } catch (error) {
      await this.prisma.billingSubscriptionOperation.updateMany({
        where: {
          id: operation.id,
          claimToken,
          state: BillingSubscriptionOperationState.PROCESSING,
        },
        data: {
          state: BillingSubscriptionOperationState.UNKNOWN,
          failureCode: 'GATEWAY_RESULT_UNKNOWN',
        },
      });
      throw error;
    }
  }

  format(subscription: any | null) {
    if (!subscription) return null;
    return {
      id: subscription.id,
      status: subscription.status,
      trialStartedAt: subscription.trialStartedAt,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodStartedAt: subscription.currentPeriodStartedAt,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
      graceEndsAt: subscription.graceEndsAt,
      lastPaymentAt: subscription.lastPaymentAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      plan: subscription.plan
        ? {
            id: subscription.plan.id,
            slug: subscription.plan.slug,
            name: subscription.plan.name,
            priceCents: subscription.plan.priceCents,
            currency: subscription.plan.currency,
            interval: subscription.plan.interval,
          }
        : null,
    };
  }

  private daysRemaining(value?: Date | null) {
    if (!value) return 0;
    return Math.max(0, Math.ceil((value.getTime() - Date.now()) / 86_400_000));
  }
}
