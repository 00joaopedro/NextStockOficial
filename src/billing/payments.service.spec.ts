import {
  BillingPaymentStatus,
  PartnerPaymentStatus,
  PartnerReferralStatus,
  PaymentGatewayProvider,
} from '@prisma/client';
import { decideBillingState } from './billing-state-order';
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
          amountCents: 100,
          currency: 'BRL',
        }),
      }),
    );
    expect(service.refundForTenant).toHaveBeenCalledWith(
      'tenant',
      'test-payment',
    );
  });
});
