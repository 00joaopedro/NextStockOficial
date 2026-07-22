import { createHmac } from 'crypto';
import { MercadoPagoAdapter } from './adapters/mercado-pago.adapter';

describe('MercadoPagoAdapter webhook', () => {
  it('accepts only a matching manifest signature', () => {
    const adapter = new MercadoPagoAdapter();
    const secret = 'application-secret';
    const ts = '1710000000';
    const digest = createHmac('sha256', secret)
      .update(`id:123;request-id:req-1;ts:${ts};`)
      .digest('hex');
    expect(
      adapter.verifyWebhookSignature({
        signature: `ts=${ts},v1=${digest}`,
        requestId: 'req-1',
        dataId: '123',
        secret,
      }),
    ).toBe(true);
    expect(
      adapter.verifyWebhookSignature({
        signature: `ts=${ts},v1=${digest}`,
        requestId: 'req-2',
        dataId: '123',
        secret,
      }),
    ).toBe(false);
  });
});
