import {
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
      gatewayMappings: [{
        provider: PaymentGatewayProvider.MERCADO_PAGO,
        paymentLinkUrl: null,
        gatewayPlanId: 'mp-plan',
      }],
    };
    const tx = {
      checkoutSession: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'checkout', ...data }),
        ),
      },
      billingEvent: { create: jest.fn().mockResolvedValue({}) },
      subscription: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      plan: { findFirst: jest.fn().mockResolvedValue(plan) },
      subscription: { findFirst: jest.fn().mockResolvedValue({ id: 'sub' }) },
      userProfile: { findUnique: jest.fn().mockResolvedValue({ email: 'admin@example.com' }) },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const gateway = {
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
      { get: () => gateway, defaultProvider: () => PaymentGatewayProvider.MERCADO_PAGO } as any,
      {
        create: jest.fn().mockImplementation((data, transaction) =>
          transaction.billingEvent.create({ data }),
        ),
      } as any,
    );

    const result = await service.create({} as any, 'ouro');
    const data = tx.checkoutSession.create.mock.calls[0][0].data;
    expect(data.expectedAmountCents).toBe(20000);
    expect(data.currency).toBe('BRL');
    expect(data.externalReference).toMatch(/^ns_cs_[0-9a-f-]+_[a-f0-9]{16}$/);
    expect(result.checkoutUrl).toContain('mercadopago.com');
    expect(result.automaticConfirmationAvailable).toBe(true);
    expect(tx.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ gatewaySubscriptionId: 'mp-subscription' }),
    }));
  });
});
