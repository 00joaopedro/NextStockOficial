import { PrismaClient } from '@prisma/client';
import { WebhookService } from '../../src/billing/webhook.service';

describe('RC-010 atomic webhook inbox claim (PostgreSQL)', () => {
  const url =
    process.env.SECURITY_TEST_DATABASE_URL || process.env.DATABASE_URL;
  const first = new PrismaClient({ datasourceUrl: url });
  const second = new PrismaClient({ datasourceUrl: url });
  let effects = 0;

  const gateway = {
    validateWebhookSignature: () => true,
    getPaymentStatus: (resourceId: string) =>
      Promise.resolve({
        gatewayPaymentId: resourceId,
        status: 'approved',
        normalizedStatus: 'APPROVED',
        externalReference: 'not-a-real-checkout',
        amountCents: 100,
        currency: 'BRL',
        paidAt: null,
        providerOccurredAt: null,
        gatewaySubscriptionId: null,
        raw: {},
      }),
  };
  const processor = {
    processVerifiedPayment: () => {
      effects += 1;
      return Promise.resolve({ processed: true });
    },
  };
  const registry = { get: () => gateway };
  const services = [
    new WebhookService(first as any, registry as any, processor as any),
    new WebhookService(second as any, registry as any, processor as any),
  ];
  const input = (id: string | undefined, resourceId: string) => ({
    headers: { 'x-request-id': `request-${resourceId}` },
    query: { 'data.id': resourceId },
    body: {
      ...(id ? { id } : {}),
      type: 'payment',
      data: { id: resourceId },
    },
  });

  beforeAll(async () => {
    process.env.BILLING_WEBHOOK_ENABLED = 'true';
    await first.gatewayWebhookEvent.deleteMany({
      where: { requestId: { startsWith: 'request-rc010-' } },
    });
  });

  afterAll(async () => {
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it.each([2, 20, 50, 100])(
    'processes exactly once across %i simultaneous deliveries',
    async (count) => {
      effects = 0;
      const key = `rc010-${count}-${Date.now()}`;
      const responses = await Promise.all(
        Array.from({ length: count }, (_, index) =>
          services[index % 2].handleMercadoPago(input(`event-${key}`, key)),
        ),
      );
      expect(responses).toHaveLength(count);
      expect(effects).toBe(1);
      expect(
        await first.gatewayWebhookEvent.count({
          where: { requestId: `request-${key}` },
        }),
      ).toBe(1);
      expect(
        await first.gatewayWebhookEvent.findFirstOrThrow({
          where: { requestId: `request-${key}` },
        }),
      ).toMatchObject({ processingStatus: 'PROCESSED', attemptCount: 1 });
    },
  );

  it('deduplicates canonical payload identity when event ID is absent', async () => {
    effects = 0;
    const key = `rc010-fallback-${Date.now()}`;
    await Promise.all([
      services[0].handleMercadoPago(input(undefined, key)),
      services[1].handleMercadoPago(input(undefined, key)),
    ]);
    expect(effects).toBe(1);
    expect(
      await first.gatewayWebhookEvent.count({
        where: { requestId: `request-${key}` },
      }),
    ).toBe(1);
  });

  it('rejects an old attempt after an expired lease is reclaimed', async () => {
    const key = `rc010-fence-${Date.now()}`;
    const identityKey = `fence-${Date.now()}`;
    const row = await first.gatewayWebhookEvent.create({
      data: {
        provider: 'MERCADO_PAGO',
        identityKey,
        accountScope: 'test',
        payloadHash: 'hash',
        signatureValid: true,
        requestId: `request-${key}`,
        processingStatus: 'PROCESSING',
        claimToken: '11111111-1111-4111-8111-111111111111',
        leaseExpiresAt: new Date(0),
      },
    });
    const claim = await (services[1] as any).claim(row);
    expect(claim).not.toBeNull();
    expect(
      await (services[0] as any).finish(
        { id: row.id, claimToken: '11111111-1111-4111-8111-111111111111' },
        'PROCESSED',
        'STALE',
      ),
    ).toBe(false);
    expect(
      (
        await first.gatewayWebhookEvent.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).claimToken,
    ).toBe(claim.claimToken);
  });
});
