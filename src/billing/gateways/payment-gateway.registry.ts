import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentGatewayProvider } from '@prisma/client';
import { MercadoPagoGatewayAdapter } from './mercado-pago/mercado-pago.adapter';
import { PaymentGateway } from './payment-gateway.interface';

@Injectable()
export class PaymentGatewayRegistry {
  private readonly gateways: Map<PaymentGatewayProvider, PaymentGateway>;

  constructor(mercadoPago: MercadoPagoGatewayAdapter) {
    this.gateways = new Map([[mercadoPago.provider, mercadoPago]]);
  }

  get(provider: PaymentGatewayProvider) {
    const gateway = this.gateways.get(provider);
    if (!gateway)
      throw new NotFoundException('Gateway de pagamento indisponivel.');
    return gateway;
  }

  defaultProvider() {
    const configured = String(
      process.env.BILLING_DEFAULT_PROVIDER || 'MERCADO_PAGO',
    )
      .trim()
      .toUpperCase();
    if (!(configured in PaymentGatewayProvider)) {
      throw new NotFoundException(
        'Gateway de pagamento configurado e indisponivel.',
      );
    }
    return configured as PaymentGatewayProvider;
  }
}
