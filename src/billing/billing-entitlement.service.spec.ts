import { SubscriptionStatus } from '@prisma/client';
import { BillingEntitlementService } from './billing-entitlement.service';

describe('BillingEntitlementService', () => {
  const prisma = { subscription: { findFirst: jest.fn() } } as any;
  const service = new BillingEntitlementService(prisma);
  const now = new Date('2026-06-28T12:00:00Z');

  beforeEach(() => {
    process.env.BILLING_ENFORCEMENT_ENABLED = 'true';
  });

  it('permite trial dentro dos 15 dias', () => {
    const result = service.evaluate({
      status: SubscriptionStatus.trialing,
      trialEndsAt: new Date('2026-06-29T12:00:00Z'),
      graceEndsAt: null,
    }, now);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('TRIAL_ACTIVE');
  });

  it('bloqueia trial expirado, active vencido e past_due sem grace', () => {
    expect(service.evaluate({
      status: SubscriptionStatus.trialing,
      trialEndsAt: new Date('2026-06-27T12:00:00Z'),
      graceEndsAt: null,
    }, now).allowed).toBe(false);
    expect(service.evaluate({
      status: SubscriptionStatus.active,
      currentPeriodEndsAt: new Date('2026-06-27T12:00:00Z'),
      graceEndsAt: null,
    }, now).allowed).toBe(false);
    expect(service.evaluate({
      status: SubscriptionStatus.past_due,
      graceEndsAt: null,
    }, now).allowed).toBe(false);
  });

  it('nao usa grace para liberar acesso sem pagamento confirmado', () => {
    expect(service.evaluate({
      status: SubscriptionStatus.expired,
      graceEndsAt: new Date('2026-06-29T12:00:00Z'),
    }, now).allowed).toBe(false);
  });
});
