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
    if (!input.gatewayPlanId) {
      throw new ServiceUnavailableException(
        'Plano recorrente Mercado Pago nao configurado.',
      );
    }
    const body = await this.request('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        preapproval_plan_id: input.gatewayPlanId,
        payer_email: input.payerEmail,
        external_reference: input.externalReference,
        back_url: input.backUrl,
        status: 'pending',
      }),
    });
    const checkoutUrl = String(body.init_point || '');
    const gatewaySubscriptionId = String(body.id || '');
    if (!checkoutUrl || !gatewaySubscriptionId) {
      throw new BadGatewayException(
        'Mercado Pago nao criou a assinatura recorrente.',
      );
    }
    return {
      checkoutUrl,
      gatewayCheckoutId: gatewaySubscriptionId,
      gatewaySubscriptionId,
      supportsExternalReference: true,
    };
  }

  validateWebhookSignature(input: GatewayWebhookInput) {
    return this.signatures.validate(input);
  }

  async getPaymentStatus(resourceId: string): Promise<GatewayPaymentResult> {
    const body = await this.request(
      `/v1/payments/${encodeURIComponent(resourceId)}`,
    );
    return this.mapPayment(body, resourceId);
  }

  async findPayments(externalReference: string) {
    const body = await this.request(
      `/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`,
    );
    return Array.isArray(body.results)
      ? body.results.map((payment: Record<string, any>) =>
          this.mapPayment(payment, String(payment.id || '')),
        )
      : [];
  }

  private mapPayment(
    body: Record<string, any>,
    resourceId: string,
  ): GatewayPaymentResult {
    this.assertMerchant(body);
    const status = String(body.status ?? 'unknown');
    return {
      gatewayPaymentId: String(body.id ?? resourceId),
      status,
      normalizedStatus: this.normalizeStatus(status),
      externalReference:
        typeof body.external_reference === 'string'
          ? body.external_reference
          : null,
      amountCents: Math.round(Number(body.transaction_amount ?? 0) * 100),
      currency: String(body.currency_id ?? ''),
      paidAt: body.date_approved ? new Date(body.date_approved) : null,
      gatewaySubscriptionId:
        typeof body.metadata?.preapproval_id === 'string'
          ? body.metadata.preapproval_id
          : typeof body.subscription_id === 'string'
            ? body.subscription_id
            : null,
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

  private async request(path: string, init: RequestInit = {}) {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!token)
      throw new ServiceUnavailableException(
        'MERCADO_PAGO_ACCESS_TOKEN nao configurado.',
      );
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      any
    >;
    if (!response.ok)
      throw new BadGatewayException('Mercado Pago nao confirmou a operacao.');
    return body;
  }

  private assertMerchant(body: Record<string, any>) {
    const mode = process.env.MERCADO_PAGO_MODE?.trim() || 'production';
    if (mode === 'production' && body.live_mode !== true) {
      throw new BadRequestException(
        'Pagamento nao pertence ao ambiente de producao.',
      );
    }
    const collectorId = process.env.MERCADO_PAGO_COLLECTOR_ID?.trim();
    if (collectorId && String(body.collector_id ?? '') !== collectorId) {
      throw new BadRequestException('Pagamento pertence a outro recebedor.');
    }
  }

  private normalizeStatus(
    status: string,
  ): GatewayPaymentResult['normalizedStatus'] {
    const value = status.toLowerCase();
    if (value === 'approved') return 'APPROVED';
    if (value === 'rejected') return 'REJECTED';
    if (value === 'cancelled' || value === 'canceled') return 'CANCELED';
    if (value === 'refunded') return 'REFUNDED';
    if (value === 'charged_back') return 'CHARGEBACK';
    return 'PENDING';
  }
}
