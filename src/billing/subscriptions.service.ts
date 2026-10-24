import { randomUUID, createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const pendingPlanChange = await this.prisma.billingSubscriptionOperation.findFirst?.({
      where: { tenantId, subscriptionId: subscription.id, operation: { startsWith: 'PLAN_CHANGE:' }, state: { in: [BillingSubscriptionOperationState.CLAIMED, BillingSubscriptionOperationState.PROCESSING, BillingSubscriptionOperationState.UNKNOWN] } },
    });
    if (pendingPlanChange) throw new ConflictException('Há uma mudança de plano aguardando confirmação do Mercado Pago.');
    const retainAccessUntilPeriodEnd =
      this.hasPaidAccessRemaining(subscription);

    // The local subscription row can be reused by a subsequent checkout. A
    // cancellation belongs to the remote subscription, not just that row.
    const operationKey = subscription.gatewaySubscriptionId
      ? `CANCEL:${createHash('sha256')
          .update(
            `${subscription.gatewayProvider}:${subscription.gatewaySubscriptionId}`,
          )
          .digest('hex')}`
      : 'CANCEL';

    const existingOperation =
      await this.prisma.billingSubscriptionOperation.findUnique({
        where: {
          tenantId_subscriptionId_operation: {
            tenantId,
            subscriptionId: subscription.id,
            operation: operationKey,
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
          cancelAtPeriodEnd: retainAccessUntilPeriodEnd,
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
        nextState: {
          status: current.status,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
          currentPeriodEndsAt:
            current.currentPeriodEndsAt?.toISOString() ?? null,
        },
      });
      return this.format(current);
    }

    if (!this.gateways || !subscription.gatewayProvider) {
      throw new ConflictException('Gateway da assinatura não está disponível.');
    }

    // Older operations did not record which remote subscription they targeted.
    // An unfinished one cannot safely be associated with a new checkout.
    const legacyOperation =
      await this.prisma.billingSubscriptionOperation.findUnique({
        where: {
          tenantId_subscriptionId_operation: {
            tenantId,
            subscriptionId: subscription.id,
            operation: 'CANCEL',
          },
        },
      });
    if (
      legacyOperation &&
      legacyOperation.state !== BillingSubscriptionOperationState.SUCCEEDED
    ) {
      throw new ConflictException(
        'Cancelamento anterior requer reconciliação antes de uma nova tentativa.',
      );
    }

    const gateway = this.gateways.get(subscription.gatewayProvider);
    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(Date.now() + 60_000);
    let operation:
      | {
          id: string;
          claimToken: string | null;
          state: BillingSubscriptionOperationState;
        }
      | undefined;

    if (!existingOperation) {
      try {
        operation = await this.prisma.billingSubscriptionOperation.create({
          data: {
            tenantId,
            subscriptionId: subscription.id,
            provider: subscription.gatewayProvider,
            operation: operationKey,
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
              operation: operationKey,
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
            gatewaySubscriptionId: subscription.gatewaySubscriptionId,
            gatewayProvider: subscription.gatewayProvider,
            status: { not: SubscriptionStatus.canceled },
          },
          data: {
            status: SubscriptionStatus.canceled,
            cancelAtPeriodEnd: retainAccessUntilPeriodEnd,
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
            nextState: {
              status: current.status,
              cancelAtPeriodEnd: current.cancelAtPeriodEnd,
              currentPeriodEndsAt:
                current.currentPeriodEndsAt?.toISOString() ?? null,
            },
          });
        }
        return this.format(current);
      }
      if (currentOperation.leaseExpiresAt > new Date()) {
        throw new ConflictException(
          'Cancelamento já está em processamento; não será feita uma segunda chamada ao gateway.',
        );
      }
      const reclaimed =
        await this.prisma.billingSubscriptionOperation.updateMany({
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

    const processing =
      await this.prisma.billingSubscriptionOperation.updateMany({
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
        if (
          current.tenantId !== tenantId ||
          current.gatewaySubscriptionId !==
            subscription.gatewaySubscriptionId ||
          current.gatewayProvider !== subscription.gatewayProvider
        ) {
          throw new ConflictException(
            'A assinatura remota foi alterada durante o cancelamento.',
          );
        }
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
            gatewaySubscriptionId: subscription.gatewaySubscriptionId,
            gatewayProvider: subscription.gatewayProvider,
            status: { not: SubscriptionStatus.canceled },
          },
          data: {
            status: SubscriptionStatus.canceled,
            cancelAtPeriodEnd: this.hasPaidAccessRemaining(current),
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
            nextState: {
              status: next.status,
              cancelAtPeriodEnd: next.cancelAtPeriodEnd,
              currentPeriodEndsAt:
                next.currentPeriodEndsAt?.toISOString() ?? null,
            },
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

  async requestPlanChange(tenantId: string, planSlug: string, idempotencyKey?: string) {
    if (!idempotencyKey?.trim()) throw new ConflictException('Idempotency-Key é obrigatória para mudar o plano.');
    const [subscription, target] = await Promise.all([
      this.prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.plan.findFirst({ where: { slug: planSlug, isActive: true, deletedAt: null } }),
    ]);
    if (!subscription || !target) throw new NotFoundException('Assinatura ou plano não encontrado.');
    if (subscription.planId === target.id) throw new ConflictException('Este já é o plano atual.');
    if (!subscription.gatewayProvider || !subscription.gatewaySubscriptionId || subscription.status !== SubscriptionStatus.active || subscription.cancelAtPeriodEnd)
      throw new ConflictException('A mudança de plano requer uma assinatura ativa, sem cancelamento pendente.');
    const activeCheckout = await this.prisma.billingCheckoutIntent.findFirst({ where: { tenantId, subscriptionId: subscription.id, state: { in: ['CLAIMED', 'PROCESSING'] } } });
    if (activeCheckout) throw new ConflictException('Há um checkout em andamento para esta assinatura.');
    const operationName = `PLAN_CHANGE:${target.id}`;
    const existing = await this.prisma.billingSubscriptionOperation.findUnique({ where: { tenantId_subscriptionId_operation: { tenantId, subscriptionId: subscription.id, operation: operationName } } });
    if (existing?.state === BillingSubscriptionOperationState.UNKNOWN) return { pending: true, targetPlan: target.slug };
    const anyPending = await this.prisma.billingSubscriptionOperation.findFirst({ where: { tenantId, subscriptionId: subscription.id, operation: { startsWith: 'PLAN_CHANGE:' }, state: { in: [BillingSubscriptionOperationState.CLAIMED, BillingSubscriptionOperationState.PROCESSING, BillingSubscriptionOperationState.UNKNOWN] } } });
    if (anyPending) throw new ConflictException('Já existe uma mudança de plano aguardando confirmação.');
    const operation = await this.prisma.billingSubscriptionOperation.create({ data: { tenantId, subscriptionId: subscription.id, targetPlanId: target.id, provider: subscription.gatewayProvider, operation: operationName, claimToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 300_000), state: BillingSubscriptionOperationState.PROCESSING } });
    const gateway = this.gateways?.get(subscription.gatewayProvider);
    if (!gateway) throw new ConflictException('Gateway da assinatura não está disponível.');
    try {
      await gateway.updateSubscriptionForNextRenewal(subscription.gatewaySubscriptionId, { amountCents: target.priceCents, currency: target.currency, frequency: target.intervalCount, idempotencyKey: createHash('sha256').update(`${tenantId}:${subscription.id}:${target.id}:${idempotencyKey}`).digest('hex') });
      await this.prisma.billingSubscriptionOperation.update({ where: { id: operation.id }, data: { state: BillingSubscriptionOperationState.UNKNOWN, claimToken: null, failureCode: null } });
      await this.events.create({ tenantId, subscriptionId: subscription.id, type: BillingEventType.PLAN_CHANGED, source: 'api', previousState: { planId: subscription.planId }, nextState: { pendingPlanId: target.id }, metadata: { pendingConfirmation: true, effectiveAt: subscription.currentPeriodEndsAt?.toISOString() ?? null } });
      return { pending: true, targetPlan: target.slug, effectiveAt: subscription.currentPeriodEndsAt };
    } catch (error) {
      await this.prisma.billingSubscriptionOperation.update({ where: { id: operation.id }, data: { state: BillingSubscriptionOperationState.UNKNOWN, claimToken: null, failureCode: 'GATEWAY_RESULT_UNKNOWN' } });
      throw error;
    }
  }

  async confirmPlanChangeFromWebhook(provider: any, gatewaySubscriptionId: string) {
    const subscription = await this.prisma.subscription.findFirst({ where: { gatewayProvider: provider, gatewaySubscriptionId } });
    if (!subscription) return false;
    const operation = await this.prisma.billingSubscriptionOperation.findFirst({
      where: { tenantId: subscription.tenantId, subscriptionId: subscription.id, operation: { startsWith: 'PLAN_CHANGE:' }, state: BillingSubscriptionOperationState.UNKNOWN },
      orderBy: { createdAt: 'desc' },
    });
    if (!operation?.targetPlanId) return false;
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.subscription.updateMany({ where: { id: subscription.id, tenantId: subscription.tenantId, version: subscription.version, gatewaySubscriptionId }, data: { planId: operation.targetPlanId!, version: { increment: 1 } } });
      if (claimed.count !== 1) return false;
      await tx.billingSubscriptionOperation.updateMany({ where: { id: operation.id, state: BillingSubscriptionOperationState.UNKNOWN }, data: { state: BillingSubscriptionOperationState.SUCCEEDED, completedAt: new Date(), failureCode: null } });
      await this.events.create({ tenantId: subscription.tenantId, subscriptionId: subscription.id, type: BillingEventType.PLAN_CHANGED, source: 'gateway_webhook', previousState: { planId: subscription.planId }, nextState: { planId: operation.targetPlanId }, metadata: { providerConfirmed: true } }, tx);
      return true;
    });
    return updated;
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

  private hasPaidAccessRemaining(subscription: {
    status?: SubscriptionStatus;
    currentPeriodEndsAt?: Date | null;
  }) {
    return Boolean(
      subscription.status === SubscriptionStatus.active &&
      subscription.currentPeriodEndsAt &&
      subscription.currentPeriodEndsAt > new Date(),
    );
  }
}
