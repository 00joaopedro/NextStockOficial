import {
  BillingPaymentStatus,
  BillingRefundIntentState,
  PartnerPaymentStatus,
  PartnerReferralStatus,
  PaymentGatewayProvider,
} from '@prisma/client';
import { decideBillingState } from './billing-state-order';
import { GatewayCheckoutError } from './gateways/payment-gateway.interface';
import { PaymentsService } from './payments.service';

describe('RC-004 billing state policy', () => {
  const at = (value: string | null) => (value ? new Date(value) : null);

  it.each([
    ['PENDING', 'APPROVED', true],
    ['PENDING', 'REJECTED', true],
    ['APPROVED', 'PENDING', false],
    ['APPROVED', 'REJECTED', false],
    ['APPROVED', 'REFUNDED', true],
    ['REFUNDED', 'APPROVED', false],
    ['REFUNDED', 'CHARGEBACK', true],
    ['CHARGEBACK', 'REFUNDED', false],
  ] as const)('%s -> %s apply=%s without provider time', (from, to, apply) => {
    expect(
      decideBillingState(
        BillingPaymentStatus[from],
        null,
        BillingPaymentStatus[to],
        null,
      ).apply,
    ).toBe(apply);
  });

  it('rejects an older event and deterministically breaks equal-time ties', () => {
    expect(
      decideBillingState(
        BillingPaymentStatus.APPROVED,
        at('2026-07-29T12:00:01Z'),
        BillingPaymentStatus.REFUNDED,
        at('2026-07-29T12:00:00Z'),
      ),
    ).toMatchObject({ apply: false, reason: 'OLDER' });
    expect(
      decideBillingState(
        BillingPaymentStatus.PENDING,
        at('2026-07-29T12:00:00Z'),
        BillingPaymentStatus.APPROVED,
        at('2026-07-29T12:00:00Z'),
      ).apply,
    ).toBe(true);
  });

  it('rejects malformed correlation before opening a transaction', async () => {
    const prisma = { $transaction: jest.fn() } as any;
    const service = new PaymentsService(prisma, {} as any);
    await expect(
      service.processVerifiedPayment(PaymentGatewayProvider.MERCADO_PAGO, {
        gatewayPaymentId: 'p',
        status: 'approved',
        normalizedStatus: 'APPROVED',
        externalReference: null,
        amountCents: 1,
        currency: 'BRL',
        paidAt: null,
        providerOccurredAt: null,
        gatewaySubscriptionId: null,
        raw: {},
      }),
    ).resolves.toEqual({
      processed: false,
      reason: 'MISSING_EXTERNAL_REFERENCE',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('sincroniza o parceiro uma única vez por transição de pagamento', async () => {
    const tx = {
      partnerReferral: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'referral',
          paymentStatus: PartnerPaymentStatus.UNPAID,
          status: PartnerReferralStatus.REGISTERED,
          convertedAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      partnerReferralPaymentEvent: { create: jest.fn() },
    } as any;
    const service = new PaymentsService({} as any, {} as any);

    await (service as any).syncPartnerReferral(
      tx,
      'tenant',
      BillingPaymentStatus.APPROVED,
      'subscription',
      'MERCADO_PAGO:payment:APPROVED',
    );

    expect(tx.partnerReferral.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: PartnerPaymentStatus.PAID,
          status: PartnerReferralStatus.CONVERTED,
        }),
      }),
    );
    expect(tx.partnerReferralPaymentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'SUBSCRIPTION_SYNC',
          providerEventId: 'MERCADO_PAGO:payment:APPROVED',
        }),
      }),
    );
  });

  it('ignora uma transição já aplicada sem criar novo evento', async () => {
    const tx = {
      partnerReferral: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'referral',
          paymentStatus: PartnerPaymentStatus.PAID,
          status: PartnerReferralStatus.CONVERTED,
          convertedAt: new Date(),
        }),
        updateMany: jest.fn(),
      },
      partnerReferralPaymentEvent: { create: jest.fn() },
    } as any;
    const service = new PaymentsService({} as any, {} as any);

    await (service as any).syncPartnerReferral(
      tx,
      'tenant',
      BillingPaymentStatus.APPROVED,
      'subscription',
      'MERCADO_PAGO:payment:APPROVED',
    );

    expect(tx.partnerReferral.updateMany).not.toHaveBeenCalled();
    expect(tx.partnerReferralPaymentEvent.create).not.toHaveBeenCalled();
  });

  it('estorna exclusivamente o pagamento aprovado do plano técnico', async () => {
    const prisma = {
      billingPayment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'test-payment' }),
      },
    } as any;
    const service = new PaymentsService(prisma, {} as any);
    jest
      .spyOn(service, 'refundForTenant')
      .mockResolvedValue({ accepted: true } as any);

    await expect(
      service.refundProductionTestForTenant('tenant'),
    ).resolves.toMatchObject({ accepted: true });

    expect(prisma.billingPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant',
          status: BillingPaymentStatus.APPROVED,
          plan: { slug: 'production-test-r1' },
          subscription: {
            is: { plan: { slug: 'production-test-r1' } },
          },
          amountCents: 100,
          currency: 'BRL',
        }),
      }),
    );
    expect(service.refundForTenant).toHaveBeenCalledWith(
      'tenant',
      'test-payment',
      { resolveGatewayPayment: true },
    );
  });

  it('expõe falha final do estorno técnico sem liberar nova tentativa', async () => {
    const prisma = {
      billingPayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'test-payment',
          amountCents: 100,
          currency: 'BRL',
        }),
      },
      billingRefundIntent: {
        findUnique: jest.fn().mockResolvedValue({
          state: BillingRefundIntentState.FAILED_FINAL,
        }),
      },
    } as any;
    const service = new PaymentsService(prisma, {} as any);

    await expect(
      service.productionTestRefundCapability('tenant'),
    ).resolves.toEqual({
      enabled: false,
      visible: true,
      action: 'NONE',
      amountCents: 100,
      currency: 'BRL',
      refundState: BillingRefundIntentState.FAILED_FINAL,
      diagnostic: null,
    });
  });

  it('registra como falha final uma recusa conhecida do gateway sem retornar 502', async () => {
    const prisma = {
      billingPayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'test-payment',
          tenantId: 'tenant',
          provider: PaymentGatewayProvider.MERCADO_PAGO,
          gatewayPaymentId: 'gateway-payment',
          status: BillingPaymentStatus.APPROVED,
        }),
      },
      billingRefundIntent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'refund-intent',
          claimToken: 'claim-token',
          state: BillingRefundIntentState.CLAIMED,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const gateway = {
      refundPayment: jest.fn().mockRejectedValue(
        new GatewayCheckoutError('Mercado Pago recusou', true, {
          code: 'bad_request',
          providerStatus: 400,
          state: 'FAILED_FINAL',
        }),
      ),
    };
    const service = new PaymentsService(
      prisma,
      {} as any,
      { get: () => gateway } as any,
    );

    await expect(
      service.refundForTenant('tenant', 'test-payment'),
    ).resolves.toMatchObject({
      accepted: false,
      status: BillingRefundIntentState.FAILED_FINAL,
    });
    expect(prisma.billingRefundIntent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: BillingRefundIntentState.FAILED_FINAL,
          failureCode: 'bad_request',
        }),
      }),
    );
  });

  it('localiza e grava o pagamento real antes de exigir nova tentativa explícita', async () => {
    const payment = {
      id: 'test-payment',
      tenantId: 'tenant',
      provider: PaymentGatewayProvider.MERCADO_PAGO,
      gatewayPaymentId: 'preapproval-id-incorreto',
      externalReference:
        'ns_cs_00000000-0000-0000-0000-000000000000_aaaaaaaaaaaaaaaa',
      amountCents: 100,
      currency: 'BRL',
      status: BillingPaymentStatus.APPROVED,
      subscription: { gatewaySubscriptionId: 'preapproval-1' },
    };
    const prisma = {
      billingPayment: {
        findFirst: jest.fn().mockResolvedValue(payment),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      billingRefundIntent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'refund-intent',
          state: BillingRefundIntentState.UNKNOWN,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const gateway = {
      getPaymentStatus: jest.fn().mockRejectedValue(
        new GatewayCheckoutError('não encontrado', true, {
          code: 'not_found',
          providerStatus: 404,
          state: 'FAILED_FINAL',
        }),
      ),
      findPayments: jest.fn().mockResolvedValue([
        {
          gatewayPaymentId: 'payment-real',
          status: 'approved',
          normalizedStatus: 'APPROVED',
          externalReference: payment.externalReference,
          amountCents: 100,
          currency: 'BRL',
          paidAt: new Date(),
          providerOccurredAt: new Date(),
          gatewaySubscriptionId: 'preapproval-1',
          raw: {},
        },
      ]),
    };
    const service = new PaymentsService(
      prisma,
      {} as any,
      { get: () => gateway } as any,
    );

    await expect(
      service.refundForTenant('tenant', 'test-payment', {
        resolveGatewayPayment: true,
      }),
    ).resolves.toMatchObject({
      accepted: false,
      status: BillingRefundIntentState.FAILED_RETRYABLE,
      diagnostic: 'PAYMENT_RESOLVED_RETRY_REQUIRED',
    });
    expect(gateway.findPayments).toHaveBeenCalledWith(
      payment.externalReference,
    );
    expect(prisma.billingPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { gatewayPaymentId: 'payment-real' },
      }),
    );
    expect(prisma.billingRefundIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: BillingRefundIntentState.FAILED_RETRYABLE,
          failureCode: 'PAYMENT_RESOLVED_RETRY_REQUIRED',
        }),
      }),
    );
  });
});
