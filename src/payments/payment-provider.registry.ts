import { Injectable } from '@nestjs/common';
import { PaymentProviderCode } from '@prisma/client';
import { MercadoPagoAdapter } from './adapters/mercado-pago.adapter';
import { PagarmeAdapter } from './adapters/pagarme.adapter';
import { StoneAdapter } from './adapters/stone.adapter';
import {
  PAYMENT_CAPABILITIES,
  PaymentCapability,
  requireCapability,
} from './payment-capabilities';
import { PaymentProviderAdapter } from './ports/payment-provider.interface';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<PaymentProviderCode, PaymentProviderAdapter>;
  constructor(
    mercadoPago: MercadoPagoAdapter,
    pagarme: PagarmeAdapter,
    stone: StoneAdapter,
  ) {
    this.providers = new Map<PaymentProviderCode, PaymentProviderAdapter>([
      [mercadoPago.code, mercadoPago],
      [pagarme.code, pagarme],
      [stone.code, stone],
    ]);
  }
  capabilities(code: PaymentProviderCode) {
    return PAYMENT_CAPABILITIES[code];
  }
  require(code: PaymentProviderCode, capability: PaymentCapability) {
    requireCapability(code, capability);
    return this.get(code);
  }
  get(code: PaymentProviderCode) {
    const provider = this.providers.get(code);
    if (!provider)
      throw new Error(`Payment provider ${code} is not configured.`);
    return provider;
  }
}
