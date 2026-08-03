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

  it('uses provider/account/event ID and a strong fallback identity', () => {
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
        'other',
        'p-2',
        'hash-b',
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

  it('sanitizes error codes', () => {
    expect(service.safeErrorCode({ name: 'Bad error: token=secret!' })).toBe(
      'Baderrortokensecret',
    );
    expect(service.safeErrorCode('secret text')).toBe('UNKNOWN');
  });
});
