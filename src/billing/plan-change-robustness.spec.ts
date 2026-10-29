import { PlanInterval, SubscriptionStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { ReconciliationService } from './reconciliation.service';
import { SubscriptionsService } from './subscriptions.service';

describe('plan change recovery', () => {
  it('exposes the pending target and confirmation state to the tenant', async () => {
    const end = new Date('2027-01-01T00:00:00Z');
    const prisma = { billingSubscriptionOperation: { findFirst: jest.fn().mockResolvedValue({ state: 'PROCESSING', targetPlan: { slug: 'ouro', name: 'Ouro', priceCents: 10000, currency: 'BRL' } }) } };
    const entitlement = { forTenant: jest.fn().mockResolvedValue({ allowed: true, reason: 'SUBSCRIPTION_ACTIVE', subscription: { id: 'sub', currentPeriodEndsAt: end } }) };
    const service = new SubscriptionsService(prisma as any, entitlement as any, {} as any);
    const result = await service.getForTenant('tenant');
    expect(result.pendingPlanChange).toMatchObject({ planSlug: 'ouro', priceCents: 10000, state: 'awaiting_payment', effectiveAt: end });
    expect(prisma.billingSubscriptionOperation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant', subscriptionId: 'sub' }) }));
  });
  it('confirms provider terms after an update without waiting for a webhook', async () => {
    const gateway = { updateSubscriptionForNextRenewal: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue({ id: 'sub', tenantId: 'tenant', planId: 'old', gatewayProvider: 'MERCADO_PAGO', gatewaySubscriptionId: 'remote', status: SubscriptionStatus.active, cancelAtPeriodEnd: false }) },
      plan: { findFirst: jest.fn().mockResolvedValue({ id: 'new', slug: 'ouro', priceCents: 100, currency: 'BRL', interval: PlanInterval.MONTHLY, intervalCount: 1 }) },
      billingCheckoutIntent: { findFirst: jest.fn().mockResolvedValue(null) },
      billingSubscriptionOperation: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'op' }) },
    };
    const service = new SubscriptionsService(prisma as any, {} as any, {} as any, { get: () => gateway } as any);
    const confirm = jest.spyOn(service, 'confirmPlanChangeFromWebhook').mockResolvedValue(true);
    await service.requestPlanChange('tenant', 'ouro', 'request-1');
    expect(gateway.updateSubscriptionForNextRenewal).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('MERCADO_PAGO', 'remote');
  });

  it('does not repeat an update if confirming provider terms fails', async () => {
    const gateway = { updateSubscriptionForNextRenewal: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue({ id: 'sub', planId: 'old', gatewayProvider: 'MERCADO_PAGO', gatewaySubscriptionId: 'remote', status: SubscriptionStatus.active }) },
      plan: { findFirst: jest.fn().mockResolvedValue({ id: 'new', slug: 'ouro', priceCents: 100, currency: 'BRL', interval: PlanInterval.MONTHLY, intervalCount: 1 }) },
      billingCheckoutIntent: { findFirst: jest.fn().mockResolvedValue(null) },
      billingSubscriptionOperation: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'op' }), updateMany: jest.fn() },
    };
    const service = new SubscriptionsService(prisma as any, {} as any, {} as any, { get: () => gateway } as any);
    jest.spyOn(service, 'confirmPlanChangeFromWebhook').mockRejectedValue(new Error('timeout'));
    expect(await service.requestPlanChange('tenant', 'ouro', 'key')).toMatchObject({ pending: true });
    expect(gateway.updateSubscriptionForNextRenewal).toHaveBeenCalledTimes(1);
    expect(prisma.billingSubscriptionOperation.updateMany).not.toHaveBeenCalled();
  });

  it('never modifies checkout when another confirmation has already claimed the operation', async () => {
    const subscription = { id: 'sub', tenantId: 'tenant', planId: 'old', currentPeriodEndsAt: new Date('2027-01-01T00:00:00Z') };
    const target = { id: 'new', priceCents: 100, currency: 'BRL', interval: PlanInterval.MONTHLY, intervalCount: 1 };
    const tx = { checkoutSession: { findFirst: jest.fn().mockResolvedValue({ id: 'checkout' }), update: jest.fn() }, billingSubscriptionOperation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const prisma = { subscription: { findFirst: jest.fn().mockResolvedValue(subscription) }, billingSubscriptionOperation: { findFirst: jest.fn().mockResolvedValue({ id: 'op', targetPlanId: 'new' }) }, plan: { findUnique: jest.fn().mockResolvedValue(target) }, $transaction: jest.fn((fn) => fn(tx)) };
    const gateway = { getSubscriptionTerms: jest.fn().mockResolvedValue({ status: 'authorized', amountCents: 100, currency: 'BRL', frequency: 1, frequencyType: 'months' }) };
    const service = new SubscriptionsService(prisma as any, {} as any, {} as any, { get: () => gateway } as any);
    expect(await service.confirmPlanChangeFromWebhook('MERCADO_PAGO', 'remote')).toBe(false);
    expect(tx.checkoutSession.update).not.toHaveBeenCalled();
  });

  it('reconciles terms before looking for payments', async () => {
    const calls: string[] = [];
    const prisma = { checkoutSession: { findMany: jest.fn().mockResolvedValue([{ id: 'checkout', provider: 'MERCADO_PAGO', gatewayCheckoutId: 'remote', externalReference: 'ref' }]), update: jest.fn() } };
    const subscriptions = { confirmPlanChangeFromWebhook: jest.fn(async () => { calls.push('terms'); return true; }) };
    const gateways = { get: () => ({ findPayments: async () => { calls.push('payments'); return []; } }) };
    const service = new ReconciliationService(prisma as any, {} as any, gateways as any, {} as any, subscriptions as any);
    await service.reconcilePendingBatch();
    expect(calls).toEqual(['terms', 'payments']);
  });

  it('continues processing payments when provider terms cannot be retrieved', async () => {
    const checkout = { id: 'checkout', provider: 'MERCADO_PAGO', gatewayCheckoutId: 'remote', externalReference: 'ref' };
    const prisma = { checkoutSession: { findMany: jest.fn().mockResolvedValue([checkout]), update: jest.fn() } };
    const subscriptions = { confirmPlanChangeFromWebhook: jest.fn().mockRejectedValue(new Error('terms unavailable')) };
    const payment = { gatewayPaymentId: 'payment' };
    const gateways = { get: () => ({ findPayments: jest.fn().mockResolvedValue([payment]) }) };
    const payments = { processVerifiedPayment: jest.fn().mockResolvedValue({ processed: true }) };
    const service = new ReconciliationService(prisma as any, {} as any, gateways as any, payments as any, subscriptions as any);
    const result = await service.reconcilePendingBatch();
    expect(payments.processVerifiedPayment).toHaveBeenCalledWith('MERCADO_PAGO', payment);
    expect(result).toMatchObject({ checked: 1, processed: 1, failed: 1 });
  });

  it('uses the full interval and clamps month-end dates', () => {
    const service = new PaymentsService({} as any, {} as any);
    expect((service as any).periodEnd(new Date('2026-01-31T12:00:00Z'), PlanInterval.MONTHLY, 1).toISOString()).toBe('2026-02-28T12:00:00.000Z');
    expect((service as any).periodEnd(new Date('2026-01-31T12:00:00Z'), PlanInterval.MONTHLY, 3).toISOString()).toBe('2026-04-30T12:00:00.000Z');
    expect((service as any).periodEnd(new Date('2024-02-29T12:00:00Z'), PlanInterval.YEARLY, 1).toISOString()).toBe('2025-02-28T12:00:00.000Z');
  });
});
