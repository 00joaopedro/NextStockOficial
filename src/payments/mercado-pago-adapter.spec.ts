import { createHmac } from 'crypto';
import { MercadoPagoAdapter } from './adapters/mercado-pago.adapter';

describe('MercadoPagoAdapter webhook', () => {
  afterEach(() => jest.restoreAllMocks());

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

  it('reconcilia PIX UNKNOWN pela external reference estavel', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ id: 'payment-1', status: 'pending' }],
      }),
    } as Response);
    await expect(
      new MercadoPagoAdapter().findPixPaymentByExternalReference(
        { accessToken: 'test-token' },
        'ns-pix-stable-reference',
      ),
    ).resolves.toMatchObject({ id: 'payment-1', status: 'pending' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('external_reference=ns-pix-stable-reference'),
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
