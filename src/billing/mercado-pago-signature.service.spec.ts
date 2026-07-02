import { createHmac } from 'crypto';
import { MercadoPagoSignatureService } from './gateways/mercado-pago/mercado-pago-signature.service';

describe('MercadoPagoSignatureService', () => {
  it('valida HMAC e rejeita assinatura falsa', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'secret';
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = 'request';
    const dataId = 'payment';
    const hash = createHmac('sha256', 'secret')
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest('hex');
    const service = new MercadoPagoSignatureService();
    const input = {
      headers: {
        'x-signature': `ts=${ts},v1=${hash}`,
        'x-request-id': requestId,
      },
      query: { 'data.id': dataId },
      body: {},
    };
    expect(service.validate(input)).toBe(true);
    expect(service.validate({
      ...input,
      headers: { ...input.headers, 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}` },
    })).toBe(false);
  });

  it('rejeita assinatura valida com timestamp antigo', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'secret';
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    const requestId = 'request';
    const dataId = 'payment';
    const hash = createHmac('sha256', 'secret')
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest('hex');
    expect(new MercadoPagoSignatureService().validate({
      headers: {
        'x-signature': `ts=${ts},v1=${hash}`,
        'x-request-id': requestId,
      },
      query: { 'data.id': dataId },
      body: {},
    })).toBe(false);
  });
});
