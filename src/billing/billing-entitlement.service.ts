import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { canAccessDev } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';

export type BillingEntitlement = {
  allowed: boolean;
  reason: string;
  redirectTo: string;
  subscription: any | null;
};

@Injectable()
export class BillingEntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async forTenant(tenantId: string, now = new Date()): Promise<BillingEntitlement> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.evaluate(subscription, now);
  }

  async forUser(user?: Express.AuthenticatedUser, now = new Date()) {
    if (!user) return this.denied('NO_AUTHENTICATED_TENANT', null);
    if (canAccessDev(user)) {
      return {
        allowed: true,
        reason: 'DEV_WORKSPACE_EXEMPT',
        redirectTo: '/perfil.html',
        subscription: null,
      };
    }
    const tenantId = user.tenantId ?? user.primaryTenantId;
    if (!tenantId) return this.denied('NO_SUBSCRIPTION', null);
    return this.forTenant(tenantId, now);
  }

  evaluate(subscription: any | null, now = new Date()): BillingEntitlement {
    if (!subscription) {
      const rolloutDisabled =
        process.env.BILLING_ENFORCEMENT_ENABLED?.toLowerCase() !== 'true';
      return rolloutDisabled
        ? {
            allowed: true,
            reason: 'ROLLOUT_ENFORCEMENT_DISABLED',
            redirectTo: '/perfil.html',
            subscription: null,
          }
        : this.denied('NO_SUBSCRIPTION', null);
    }
    if (subscription.graceEndsAt && subscription.graceEndsAt > now) {
      return this.allowed('GRACE_PERIOD', subscription);
    }
    if (
      subscription.status === SubscriptionStatus.trialing &&
      subscription.trialEndsAt &&
      subscription.trialEndsAt > now
    ) {
      return this.allowed('TRIAL_ACTIVE', subscription);
    }
    if (
      subscription.status === SubscriptionStatus.active &&
      (!subscription.currentPeriodEndsAt ||
        subscription.currentPeriodEndsAt > now)
    ) {
      return this.allowed('SUBSCRIPTION_ACTIVE', subscription);
    }
    if (subscription.status === SubscriptionStatus.trialing) {
      return this.denied('TRIAL_EXPIRED', subscription);
    }
    if (subscription.status === SubscriptionStatus.past_due) {
      return this.denied('PAST_DUE', subscription);
    }
    return this.denied(
      `SUBSCRIPTION_${String(subscription.status).toUpperCase()}`,
      subscription,
    );
  }

  private allowed(reason: string, subscription: any) {
    return { allowed: true, reason, redirectTo: '/perfil.html', subscription };
  }

  private denied(reason: string, subscription: any) {
    return { allowed: false, reason, redirectTo: '/perfil.html', subscription };
  }
}
