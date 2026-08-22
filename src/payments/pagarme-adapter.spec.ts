/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PagarmeAdapter } from './adapters/pagarme.adapter';

describe('PagarmeAdapter Core API v5', () => {
  const oldFetch = global.fetch;
  afterEach(() => {
    global.fetch = oldFetch;
    delete process.env.PAGARME_ENABLED;
    delete process.env.PAGARME_PIX_ENABLED;
  });

  it('inicia desligado', async () => {
    await expect(
      new PagarmeAdapter().validateConnection({
        accessToken: 'sk_test_safe_fixture',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('usa Basic, idempotencia e converte fixture PIX sanitizada', async () => {
    process.env.PAGARME_PIX_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'or_test',
        status: 'pending',
        charges: [
          {
            last_transaction: {
              qr_code: 'safe-copy-paste',
              qr_code_url: 'https://example.invalid/qr',
            },
          },
        ],
      }),
    });
    const result = await new PagarmeAdapter().createPixPayment(
      { accessToken: 'sk_test_safe_fixture' },
      {
        amountCents: 1234,
        externalReference: 'ns-safe',
        description: 'Pedido teste',
      },
      'idem-safe',
    );
    expect(result).toEqual({
      id: 'or_test',
      status: 'pending',
      qrCode: 'safe-copy-paste',
      qrCodeBase64: 'https://example.invalid/qr',
    });
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(request.headers.Authorization).toBe(
      `Basic ${Buffer.from('sk_test_safe_fixture:').toString('base64')}`,
    );
    expect(request.headers['Idempotency-Key']).toBe('idem-safe');
    expect(request.body).not.toContain('card_number');
  });

  it('rejeita resposta contratual sem id/status', async () => {
    process.env.PAGARME_PIX_ENABLED = 'true';
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(
      new PagarmeAdapter().createPixPayment(
        { accessToken: 'safe' },
        { amountCents: 1, externalReference: 'safe', description: 'safe' },
        'safe-key',
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
