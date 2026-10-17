import { PrismaClient } from '@prisma/client';
import { WebhookService } from '../../src/billing/webhook.service';

describe('RC-010 atomic webhook inbox claim (PostgreSQL)', () => {
  const url =
    process.env.SECURITY_TEST_DATABASE_URL || process.env.DATABASE_URL;
  const first = new PrismaClient({ datasourceUrl: url });
  const second = new PrismaClient({ datasourceUrl: url });
  let effects = 0;
  let providerLookups = 0;
  const originalBillingMode = process.env.BILLING_MODE;
  const originalMercadoPagoMode = process.env.MERCADO_PAGO_MODE;

  const gateway = {
    validateWebhookSignature: () => true,
    getPaymentStatus: (resourceId: string) => {
      providerLookups += 1;
      return Promise.resolve({
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
      });
    },
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
  const input = (
    id: string | undefined,
    resourceId: string,
    liveMode?: boolean,
    type = 'payment',
  ) => ({
    headers: { 'x-request-id': `request-${resourceId}` },
    query: { 'data.id': resourceId },
    body: {
      ...(id ? { id } : {}),
      type,
      ...(liveMode === undefined ? {} : { live_mode: liveMode }),
      data: { id: resourceId },
    },
  });

  beforeAll(async () => {
    process.env.BILLING_WEBHOOK_ENABLED = 'true';
    process.env.BILLING_MODE = 'production';
    process.env.MERCADO_PAGO_MODE = 'production';
    await first.gatewayWebhookEvent.deleteMany({
      where: { requestId: { startsWith: 'request-rc010-' } },
    });
  });

  beforeEach(() => {
    providerLookups = 0;
    effects = 0;
  });

  afterAll(async () => {
    if (originalBillingMode === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = originalBillingMode;
    if (originalMercadoPagoMode === undefined)
      delete process.env.MERCADO_PAGO_MODE;
    else process.env.MERCADO_PAGO_MODE = originalMercadoPagoMode;
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

  it('acknowledges a signed dashboard simulation without provider I/O or inbox writes', async () => {
    const key = `rc010-simulation-${Date.now()}`;
    const result = await services[0].handleMercadoPago(
      input(`event-${key}`, key, false),
    );
    expect(result).toEqual({
      received: true,
      processed: false,
      simulation: true,
    });
    expect(providerLookups).toBe(0);
    expect(
      await first.gatewayWebhookEvent.count({
        where: { requestId: `request-${key}` },
      }),
    ).toBe(0);
  });

  it('acknowledges a signed preapproval dashboard simulation without inbox writes', async () => {
    const key = `rc010-preapproval-simulation-${Date.now()}`;
    const result = await services[0].handleMercadoPago(
      input(`event-${key}`, key, false, 'subscription_preapproval'),
    );
    expect(result).toEqual({
      received: true,
      processed: false,
      simulation: true,
    });
    expect(providerLookups).toBe(0);
    expect(
      await first.gatewayWebhookEvent.count({
        where: { requestId: `request-${key}` },
      }),
    ).toBe(0);
  });

  it('acknowledges a live subscription payment event without resolving it as a payment', async () => {
    const key = `rc010-subscription-payment-${Date.now()}`;
    const result = await services[0].handleMercadoPago(
      input(`event-${key}`, key, true, 'subscription_authorized_payment'),
    );

    expect(result).toEqual({ received: true, processed: false });
    expect(providerLookups).toBe(0);
    expect(effects).toBe(0);
    expect(
      await first.gatewayWebhookEvent.findFirstOrThrow({
        where: { requestId: `request-${key}` },
      }),
    ).toMatchObject({
      processingStatus: 'IGNORED',
      failureCode: 'NON_PAYMENT_EVENT',
    });
  });

  it('processes a signed non-live sandbox payment normally', async () => {
    const key = `rc010-sandbox-${Date.now()}`;
    process.env.BILLING_MODE = 'sandbox';
    process.env.MERCADO_PAGO_MODE = 'sandbox';
    try {
      await expect(
        services[0].handleMercadoPago(input(`event-${key}`, key, false)),
      ).resolves.toEqual({ received: true, processed: true });
      expect(providerLookups).toBe(1);
    } finally {
      process.env.BILLING_MODE = 'production';
      process.env.MERCADO_PAGO_MODE = 'production';
    }
  });

  it('keeps event identity distinct across signed event types that reuse an ID', () => {
    const service = services[0] as any;
    const paymentIdentity = service.identity(
      'MERCADO_PAGO',
      'scope',
      '123456',
      'payment',
      '123456',
      'hash',
    );
    const subscriptionIdentity = service.identity(
      'MERCADO_PAGO',
      'scope',
      '123456',
      'subscription_preapproval',
      '123456',
      'hash',
    );
    expect(paymentIdentity).not.toBe(subscriptionIdentity);
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
