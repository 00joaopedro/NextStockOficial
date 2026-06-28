import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentGatewayProvider } from '@prisma/client';
import { MercadoPagoSignatureService } from './mercado-pago-signature.service';
import {
  CreateGatewayCheckoutInput,
  GatewayPaymentResult,
  GatewayWebhookInput,
  PaymentGateway,
} from '../payment-gateway.interface';

@Injectable()
export class MercadoPagoGatewayAdapter implements PaymentGateway {
  readonly provider = PaymentGatewayProvider.MERCADO_PAGO;

  constructor(private readonly signatures: MercadoPagoSignatureService) {}

  async createCheckout(input: CreateGatewayCheckoutInput) {
    if (!input.paymentLinkUrl) {
      throw new ServiceUnavailableException(
        'Link de pagamento Mercado Pago nao configurado.',
      );
    }
    const url = new URL(input.paymentLinkUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'mpago.la') {
      throw new BadRequestException('Link Mercado Pago configurado e invalido.');
    }
    return {
      checkoutUrl: url.toString(),
      gatewayCheckoutId: input.gatewayPlanId ?? null,
      supportsExternalReference: false,
    };
  }

  validateWebhookSignature(input: GatewayWebhookInput) {
    return this.signatures.validate(input);
  }

  async getPaymentStatus(resourceId: string): Promise<GatewayPaymentResult> {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!token) {
      throw new ServiceUnavailableException(
        'MERCADO_PAGO_ACCESS_TOKEN nao configurado.',
      );
    }
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(resourceId)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );
    const body = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new BadGatewayException('Mercado Pago nao confirmou o pagamento.');
    }
    return {
      gatewayPaymentId: String(body.id ?? resourceId),
      status: String(body.status ?? 'unknown'),
      externalReference:
        typeof body.external_reference === 'string'
          ? body.external_reference
          : null,
      amountCents: Math.round(Number(body.transaction_amount ?? 0) * 100),
      currency: String(body.currency_id ?? ''),
      paidAt: body.date_approved ? new Date(body.date_approved) : null,
      raw: {
        id: body.id,
        status: body.status,
        status_detail: body.status_detail,
        external_reference: body.external_reference,
        transaction_amount: body.transaction_amount,
        currency_id: body.currency_id,
        date_approved: body.date_approved,
        live_mode: body.live_mode,
        collector_id: body.collector_id,
      },
    };
  }

  syncPayment(resourceId: string) {
    return this.getPaymentStatus(resourceId);
  }
}
