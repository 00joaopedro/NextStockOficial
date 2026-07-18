import {
  BillingPaymentStatus,
  PaymentGatewayProvider,
  PlanInterval,
  SubscriptionStatus,
} from '@prisma/client';
import { PaymentsService } from './payments.service';
import { createBillingExternalReference } from './external-reference.util';

describe('PaymentsService', () => {
  const checkout = {
    id: 'checkout',
    tenantId: 'tenant-a',
    planId: 'plan',
    subscriptionId: 'subscription',
    provider: PaymentGatewayProvider.MERCADO_PAGO,
    expectedAmountCents: 20000,
    currency: 'BRL',
    plan: { interval: PlanInterval.MONTHLY },
    subscription: { id: 'subscription' },
  };

  function setup() {
    const tx = {
      billingPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'payment', ...data }),
          ),
        update: jest.fn(),
      },
      billingInvoice: {
        upsert: jest.fn().mockResolvedValue({ id: 'invoice' }),
      },
      subscription: { update: jest.fn().mockResolvedValue({}) },
      checkoutSession: { update: jest.fn().mockResolvedValue({}) },
      billingEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      checkoutSession: { findUnique: jest.fn().mockResolvedValue(checkout) },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const events = {
      create: jest
        .fn()
        .mockImplementation((data, transaction) =>
          transaction.billingEvent.create({ data }),
        ),
    } as any;
    return { tx, prisma, service: new PaymentsService(prisma, events) };
  }

  const gatewayResult = (
    status: string,
    externalReference = createBillingExternalReference(),
  ) => ({
    gatewayPaymentId: 'gateway-payment',
    status,
    externalReference,
    amountCents: 20000,
    currency: 'BRL',
    paidAt: new Date('2026-06-28T12:00:00Z'),
    gatewaySubscriptionId: 'gateway-subscription',
    normalizedStatus:
      status === 'approved'
        ? ('APPROVED' as const)
        : status === 'rejected'
          ? ('REJECTED' as const)
          : ('PENDING' as const),
    raw: { status, live_mode: true },
  });

  it('approved ativa apenas a subscription ligada ao checkout validado', async () => {
    const { service, tx } = setup();
    const result = await service.processVerifiedPayment(
      PaymentGatewayProvider.MERCADO_PAGO,
      gatewayResult('approved'),
    );
    expect(result.processed).toBe(true);
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'subscription' },
        data: expect.objectContaining({
          status: SubscriptionStatus.active,
          planId: 'plan',
          lastPaymentAt: expect.any(Date),
        }),
      }),
    );
  });

  it('pending e rejected nunca ativam assinatura', async () => {
    for (const status of ['pending', 'rejected']) {
      const { service, tx } = setup();
      await service.processVerifiedPayment(
        PaymentGatewayProvider.MERCADO_PAGO,
        gatewayResult(status),
      );
      expect(tx.subscription.update).not.toHaveBeenCalled();
    }
  });

  it('sem externalReference nao correlaciona nem ativa tenant', async () => {
    const { service, tx, prisma } = setup();
    const result = await service.processVerifiedPayment(
      PaymentGatewayProvider.MERCADO_PAGO,
      gatewayResult('approved', null as any),
    );
    expect(result).toEqual({
      processed: false,
      reason: 'MISSING_EXTERNAL_REFERENCE',
    });
    expect(prisma.checkoutSession.findUnique).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('webhook duplicado atualiza Payment existente em vez de criar outro', async () => {
    const { service, tx } = setup();
    tx.billingPayment.findFirst.mockResolvedValue({
      id: 'payment-existing',
      paidAt: null,
    });
    tx.billingPayment.update.mockResolvedValue({
      id: 'payment-existing',
      status: BillingPaymentStatus.APPROVED,
    });
    await service.processVerifiedPayment(
      PaymentGatewayProvider.MERCADO_PAGO,
      gatewayResult('approved'),
    );
    expect(tx.billingPayment.create).not.toHaveBeenCalled();
    expect(tx.billingPayment.update).toHaveBeenCalled();
  });
});
