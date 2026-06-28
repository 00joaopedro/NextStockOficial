import { Injectable } from '@nestjs/common';
import { BillingEventType, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingEntitlementService } from './billing-entitlement.service';
import { BillingEventsService } from './billing-events.service';

export const TRIAL_DAYS = 15;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: BillingEntitlementService,
    private readonly events: BillingEventsService,
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
