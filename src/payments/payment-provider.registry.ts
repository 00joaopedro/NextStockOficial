import { Injectable } from '@nestjs/common';
import { PaymentProviderCode } from '@prisma/client';
import { MercadoPagoAdapter } from './adapters/mercado-pago.adapter';
import { PaymentProviderAdapter } from './ports/payment-provider.interface';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<PaymentProviderCode, PaymentProviderAdapter>;
  constructor(mercadoPago: MercadoPagoAdapter) {
    this.providers = new Map([[mercadoPago.code, mercadoPago]]);
  }
  get(code: PaymentProviderCode) {
    const provider = this.providers.get(code);
    if (!provider)
      throw new Error(`Payment provider ${code} is not configured.`);
    return provider;
  }
}
