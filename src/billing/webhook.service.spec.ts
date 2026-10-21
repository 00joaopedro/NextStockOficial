import { PaymentGatewayProvider } from '@prisma/client';
import { WebhookService } from './webhook.service';

describe('RC-010 webhook inbox policy', () => {
  const service = new WebhookService({} as any, {} as any, {} as any) as any;

  it('canonicalizes object keys while preserving array order', () => {
    expect(service.canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      service.canonicalJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(service.canonicalJson([1, 2])).not.toBe(
      service.canonicalJson([2, 1]),
    );
  });

  it('uses provider/account/event/type/resource and a strong fallback identity', () => {
    const provider = PaymentGatewayProvider.MERCADO_PAGO;
    const byId = service.identity(
      provider,
      'account-a',
      'evt-1',
      'payment',
      'p-1',
      'hash-a',
    );
    expect(byId).toBe(
      service.identity(
        provider,
        'account-a',
        'evt-1',
        'payment',
        'p-1',
        'hash-b',
      ),
    );
    expect(byId).not.toBe(
      service.identity(
        provider,
        'account-a',
        'evt-1',
        'other',
        'p-1',
        'hash-a',
      ),
    );
    expect(byId).not.toBe(
      service.identity(
        provider,
        'account-a',
        'evt-1',
        'payment',
        'p-2',
        'hash-a',
      ),
    );
    expect(byId).not.toBe(
      service.identity(
        provider,
        'account-b',
        'evt-1',
        'payment',
        'p-1',
        'hash-a',
      ),
    );
    expect(
      service.identity(provider, 'account-a', null, 'payment', 'p-1', 'hash-a'),
    ).not.toBe(
      service.identity(provider, 'account-a', null, 'payment', 'p-1', 'hash-b'),
    );
  });

  it('only acknowledges non-live dashboard simulations in Mercado Pago production mode', () => {
    const originalBillingMode = process.env.BILLING_MODE;
    const originalMercadoPagoMode = process.env.MERCADO_PAGO_MODE;
    try {
      process.env.BILLING_MODE = 'production';
      process.env.MERCADO_PAGO_MODE = 'production';
      expect(service.isMercadoPagoProductionMode()).toBe(true);
      process.env.BILLING_MODE = 'sandbox';
      expect(service.isMercadoPagoProductionMode()).toBe(true);
      process.env.MERCADO_PAGO_MODE = 'sandbox';
      expect(service.isMercadoPagoProductionMode()).toBe(false);
    } finally {
      if (originalBillingMode === undefined) delete process.env.BILLING_MODE;
      else process.env.BILLING_MODE = originalBillingMode;
      if (originalMercadoPagoMode === undefined)
        delete process.env.MERCADO_PAGO_MODE;
      else process.env.MERCADO_PAGO_MODE = originalMercadoPagoMode;
    }
  });

  it('recognizes only explicit payment topics as payment resources', () => {
    expect(service.isMercadoPagoPaymentEvent('payment')).toBe(true);
    expect(service.isMercadoPagoPaymentEvent('payment.updated')).toBe(true);
    expect(
      service.isMercadoPagoPaymentEvent('subscription_authorized_payment'),
    ).toBe(false);
    expect(service.isMercadoPagoPaymentEvent('subscription_preapproval')).toBe(
      false,
    );
  });

  it('sanitizes error codes', () => {
    expect(service.safeErrorCode({ name: 'Bad error: token=secret!' })).toBe(
      'ERROR',
    );
    expect(service.safeErrorCode({ code: 'P1001' })).toBe('P1001');
    expect(service.safeErrorCode({ code: 'secret-token' })).toBe('ERROR');
    expect(service.safeErrorCode('secret text')).toBe('UNKNOWN');
  });

  it('permite nova entrega reclamar evento retryable e limpar a falha anterior', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const worker = new WebhookService(
      { gatewayWebhookEvent: { updateMany } } as any,
      {} as any,
      {} as any,
    ) as any;
    await expect(
      worker.claim({
        id: 'event',
        provider: PaymentGatewayProvider.MERCADO_PAGO,
      }),
    ).resolves.toMatchObject({ id: 'event' });
    expect(updateMany.mock.calls[0][0].where.OR).toContainEqual({
      processingStatus: 'FAILED_RETRYABLE',
    });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      processingStatus: 'PROCESSING',
      failureCode: null,
      attemptCount: { increment: 1 },
    });
  });
});
