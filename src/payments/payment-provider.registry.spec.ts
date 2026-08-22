import { BadRequestException } from '@nestjs/common';
import { PaymentProviderCode } from '@prisma/client';
import { MercadoPagoAdapter } from './adapters/mercado-pago.adapter';
import { PagarmeAdapter } from './adapters/pagarme.adapter';
import { StoneAdapter } from './adapters/stone.adapter';
import { PaymentProviderRegistry } from './payment-provider.registry';

describe('PaymentProviderRegistry', () => {
  const mercadoPago = {
    code: PaymentProviderCode.MERCADO_PAGO,
  } as MercadoPagoAdapter;
  const pagarme = { code: PaymentProviderCode.PAGARME } as PagarmeAdapter;
  const stone = { code: PaymentProviderCode.STONE } as StoneAdapter;
  const registry = new PaymentProviderRegistry(mercadoPago, pagarme, stone);

  it('mantem adapters tecnicamente separados e sem fallback', () => {
    expect(registry.get(PaymentProviderCode.MERCADO_PAGO)).toBe(mercadoPago);
    expect(registry.get(PaymentProviderCode.PAGARME)).toBe(pagarme);
    expect(registry.get(PaymentProviderCode.STONE)).toBe(stone);
    expect(() => registry.get('UNKNOWN' as PaymentProviderCode)).toThrow(
      'not configured',
    );
  });

  it('bloqueia capacidade Stone remota e expoe a matriz', () => {
    expect(registry.capabilities(PaymentProviderCode.PAGARME).PIX).toBe(
      'SUPPORTED',
    );
    expect(
      registry.capabilities(PaymentProviderCode.STONE).START_POS_PAYMENT,
    ).toBe('REQUIRES_LOCAL_SDK');
    expect(() =>
      registry.require(PaymentProviderCode.STONE, 'START_POS_PAYMENT'),
    ).toThrow(BadRequestException);
  });
});
