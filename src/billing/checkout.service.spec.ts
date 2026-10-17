import {
  BillingPaymentStatus,
  PaymentGatewayProvider,
  PlanInterval,
  Role,
} from '@prisma/client';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  it('cria assinatura recorrente e externalReference opaca', async () => {
    process.env.PUBLIC_APP_URL = 'https://app.nextstock.test';
    const plan = {
      id: 'plan',
      slug: 'ouro',
      name: 'Ouro',
      priceCents: 20000,
      currency: 'BRL',
      interval: PlanInterval.MONTHLY,
      intervalCount: 1,
      gatewayMappings: [
        {
          provider: PaymentGatewayProvider.MERCADO_PAGO,
          paymentLinkUrl: null,
          gatewayPlanId: 'mp-plan',
        },
      ],
    };
    const tx = {
      checkoutSession: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'checkout', ...data }),
          ),
      },
      billingEvent: { create: jest.fn().mockResolvedValue({}) },
      subscription: { update: jest.fn().mockResolvedValue({}) },
      billingCheckoutIntent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      plan: { findFirst: jest.fn().mockResolvedValue(plan) },
      subscription: { findFirst: jest.fn().mockResolvedValue({ id: 'sub' }) },
      checkoutSession: { findFirst: jest.fn().mockResolvedValue(null) },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ email: 'admin@example.com' }),
      },
      billingCheckoutIntent: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'intent', ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const gateway = {
      supportsIdempotentCheckoutRecovery: true,
      createCheckout: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://www.mercadopago.com/subscriptions/checkout',
        gatewayCheckoutId: 'mp-subscription',
        gatewaySubscriptionId: 'mp-subscription',
        supportsExternalReference: true,
      }),
    };
    const service = new CheckoutService(
      prisma,
      {
        resolve: jest.fn().mockResolvedValue({
          tenantId: 'tenant',
          userId: 'user',
          role: Role.Admin,
        }),
      } as any,
      {
        get: () => gateway,
        defaultProvider: () => PaymentGatewayProvider.MERCADO_PAGO,
      } as any,
      {
        create: jest
          .fn()
          .mockImplementation((data, transaction) =>
            transaction.billingEvent.create({ data }),
          ),
      } as any,
    );

    const result = await service.create({} as any, 'ouro', 'checkout-key-123');
    const data = tx.checkoutSession.create.mock.calls[0][0].data;
    expect(data.expectedAmountCents).toBe(20000);
    expect(data.currency).toBe('BRL');
    expect(data.externalReference).toMatch(/^ns_cs_[0-9a-f-]+_[a-f0-9]{16}$/);
    expect(result.checkoutUrl).toContain('mercadopago.com');
    expect(result.automaticConfirmationAvailable).toBe(true);
    expect(gateway.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/),
        externalReference: expect.stringMatching(/^ns_cs_/),
        recurrence: { frequency: 1, frequencyType: 'months' },
      }),
    );
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gatewaySubscriptionId: 'mp-subscription',
        }),
      }),
    );
    expect(tx.subscription.update.mock.calls[0][0].data).not.toHaveProperty(
      'status',
    );
  });

  it('converte plano anual em recorrência de doze meses sem plano externo', async () => {
    process.env.PUBLIC_APP_URL = 'https://app.nextstock.test';
    const plan = {
      id: 'plan',
      slug: 'ouro',
      name: 'Ouro',
      priceCents: 20000,
      currency: 'BRL',
      interval: PlanInterval.YEARLY,
      intervalCount: 1,
      gatewayMappings: [{ provider: PaymentGatewayProvider.MERCADO_PAGO }],
    };
    const tx = {
      checkoutSession: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'checkout', ...data }),
          ),
      },
      billingEvent: { create: jest.fn().mockResolvedValue({}) },
      subscription: { update: jest.fn().mockResolvedValue({}) },
      billingCheckoutIntent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      plan: { findFirst: jest.fn().mockResolvedValue(plan) },
      subscription: { findFirst: jest.fn().mockResolvedValue({ id: 'sub' }) },
      checkoutSession: { findFirst: jest.fn().mockResolvedValue(null) },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ email: 'admin@example.com' }),
      },
      billingCheckoutIntent: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'intent', ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const gateway = {
      supportsIdempotentCheckoutRecovery: true,
      createCheckout: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://www.mercadopago.com/subscriptions/checkout',
        gatewayCheckoutId: 'mp-subscription',
        gatewaySubscriptionId: 'mp-subscription',
        supportsExternalReference: true,
      }),
    };
    const service = new CheckoutService(
      prisma,
      {
        resolve: jest.fn().mockResolvedValue({
          tenantId: 'tenant',
          userId: 'user',
          role: Role.Admin,
        }),
      } as any,
      {
        get: () => gateway,
        defaultProvider: () => PaymentGatewayProvider.MERCADO_PAGO,
      } as any,
      {
        create: jest
          .fn()
          .mockImplementation((data, transaction) =>
            transaction.billingEvent.create({ data }),
          ),
      } as any,
    );

    await service.create({} as any, 'ouro', 'checkout-key-123');

    expect(gateway.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: { frequency: 12, frequencyType: 'months' },
      }),
    );
    expect(gateway.createCheckout.mock.calls[0][0]).not.toHaveProperty(
      'gatewayPlanId',
    );
  });

  it('define término no prazo da promoção para impedir renovação ilimitada', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-16T00:00:00.000Z'));
    const service = new CheckoutService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect((service as any).recurrence(PlanInterval.MONTHLY, 1, 3)).toEqual({
      frequency: 1,
      frequencyType: 'months',
      endDate: '2027-01-16T00:00:00.000Z',
    });
    jest.useRealTimers();
  });

  it('indisponibiliza um novo teste de produção depois de um pagamento aprovado', async () => {
    process.env.BILLING_PRODUCTION_TEST_ENABLED = 'true';
    process.env.BILLING_PRODUCTION_TEST_ADMIN_EMAIL = 'admin@example.com';
    const service = new CheckoutService(
      {
        billingPayment: {
          findFirst: jest.fn().mockResolvedValue({ id: 'approved-payment' }),
        },
      } as any,
      {
        resolve: jest
          .fn()
          .mockResolvedValue({ tenantId: 'tenant', userId: 'user' }),
      } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.productionTestCheckoutAvailable({
        email: 'admin@example.com',
        role: Role.Admin,
      } as any),
    ).resolves.toBe(false);
    expect(
      (service as any).prisma.billingPayment.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: BillingPaymentStatus.APPROVED,
        }),
      }),
    );
  });
});
