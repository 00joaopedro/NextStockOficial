import {
  BadRequestException,
  Logger,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentGatewayProvider } from '@prisma/client';
import { MercadoPagoSignatureService } from './mercado-pago-signature.service';
import {
  CreateGatewayCheckoutInput,
  GatewayPaymentResult,
  GatewayCheckoutError,
  GatewayWebhookInput,
  PaymentGateway,
} from '../payment-gateway.interface';

@Injectable()
export class MercadoPagoGatewayAdapter implements PaymentGateway {
  private readonly logger = new Logger(MercadoPagoGatewayAdapter.name);
  readonly provider = PaymentGatewayProvider.MERCADO_PAGO;
  readonly supportsIdempotentCheckoutRecovery = true;

  constructor(private readonly signatures: MercadoPagoSignatureService) {}

  async createCheckout(input: CreateGatewayCheckoutInput) {
    if (!input.gatewayPlanId) {
      throw new ServiceUnavailableException(
        'Plano recorrente Mercado Pago nao configurado.',
      );
    }
    const body = await this.request('/preapproval', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': input.idempotencyKey },
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
      throw new GatewayCheckoutError(
        'Mercado Pago nao criou a assinatura recorrente.',
        true,
        { code: 'GATEWAY_INVALID_RESPONSE', state: 'FAILED_RETRYABLE' },
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

  async cancelSubscription(
    gatewaySubscriptionId: string,
    idempotencyKey?: string,
  ) {
    await this.request(
      `/preapproval/${encodeURIComponent(gatewaySubscriptionId)}`,
      {
        method: 'PUT',
        headers: idempotencyKey
          ? { 'X-Idempotency-Key': idempotencyKey }
          : undefined,
        body: JSON.stringify({ status: 'cancelled' }),
      },
    );
  }

  async refundPayment(gatewayPaymentId: string) {
    await this.request(
      `/v1/payments/${encodeURIComponent(gatewayPaymentId)}/refunds`,
      { method: 'POST', body: JSON.stringify({}) },
    );
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
    const metadata =
      body.metadata && typeof body.metadata === 'object'
        ? (body.metadata as Record<string, unknown>)
        : {};
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
      paidAt: this.date(body.date_approved),
      // Mercado Pago documents date_last_updated on the payment resource. Do
      // not substitute webhook receipt time or the local clock when absent.
      providerOccurredAt: this.date(body.date_last_updated),
      gatewaySubscriptionId:
        typeof metadata.preapproval_id === 'string'
          ? metadata.preapproval_id
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
        date_last_updated: body.date_last_updated,
        live_mode: body.live_mode,
        collector_id: body.collector_id,
      },
    };
  }

  private date(value: unknown) {
    if (typeof value !== 'string') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

    const timeoutMs = this.providerTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const method = init.method || 'GET';
    let response: Response;
    try {
      response = await fetch(`https://api.mercadopago.com${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers || {}),
        },
      });
    } catch (error) {
      const timeoutError = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        `gateway.request_failed provider=MERCADO_PAGO method=${method} path=${path} outcome=${timeoutError ? 'timeout' : 'network_error'} timeout_ms=${timeoutMs}`,
      );
      throw new GatewayCheckoutError(
        'Mercado Pago temporariamente indisponivel.',
        true,
        {
          code: timeoutError ? 'GATEWAY_TIMEOUT' : 'GATEWAY_NETWORK_ERROR',
          state: 'UNKNOWN',
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      const providerRequestId =
        response.headers.get('x-request-id') ||
        response.headers.get('x-correlation-id') ||
        undefined;
      const providerCode = this.providerErrorCode(body);
      const state = response.status >= 500 || response.status === 429
        ? 'FAILED_RETRYABLE'
        : 'FAILED_FINAL';
      this.logger.error(
        `gateway.request_failed provider=MERCADO_PAGO method=${method} path=${path} status=${response.status} code=${providerCode} request_id=${providerRequestId || 'none'} state=${state}`,
      );
      throw new GatewayCheckoutError(
        response.status >= 500 || response.status === 429
          ? 'Mercado Pago temporariamente indisponivel.'
          : 'Mercado Pago rejeitou a operacao.',
        true,
        {
          code: providerCode,
          providerStatus: response.status,
          providerRequestId,
          state,
        },
      );
    }
    return body;
  }

  private providerTimeoutMs() {
    const configured = Number(process.env.MERCADO_PAGO_REQUEST_TIMEOUT_MS || 12_000);
    return Number.isInteger(configured) && configured >= 3_000 && configured <= 20_000
      ? configured
      : 12_000;
  }

  private providerErrorCode(body: Record<string, any>) {
    const cause = Array.isArray(body.cause) ? body.cause[0] : undefined;
    const candidates = [
      body.code,
      body.error,
      cause && typeof cause === 'object' ? cause.code : undefined,
      cause && typeof cause === 'object' ? cause.description : undefined,
    ];
    const value = candidates.find(
      (candidate) => typeof candidate === 'string' && candidate.trim(),
    );
    return String(value || 'GATEWAY_PROVIDER_REJECTED')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 120);
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
