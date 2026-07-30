import { BillingPaymentStatus, PaymentGatewayProvider } from '@prisma/client';
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
});
