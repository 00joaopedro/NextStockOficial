/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentProviderCode } from '@prisma/client';
import {
  PaymentProviderAdapter,
  PixPaymentProviderAdapter,
  ProviderCredentials,
  ProviderPayment,
} from '../ports/payment-provider.interface';

@Injectable()
export class PagarmeAdapter
  implements PaymentProviderAdapter, PixPaymentProviderAdapter
{
  readonly code = PaymentProviderCode.PAGARME;
  private readonly base = 'https://api.pagar.me/core/v5';

  async validateConnection(credentials: ProviderCredentials) {
    this.enabled('PAGARME_ENABLED');
    const result = (await this.request(
      '/customers?size=1',
      'GET',
      credentials,
    )) as { data?: Array<{ id?: string }> };
    void result;
    return { capabilities: this.enabledCapabilities() };
  }
  async createPixPayment(
    credentials: ProviderCredentials,
    input: {
      amountCents: number;
      externalReference: string;
      description: string;
    },
    key: string,
  ) {
    this.enabled('PAGARME_PIX_ENABLED');
    const order = (await this.request(
      '/orders',
      'POST',
      credentials,
      {
        code: input.externalReference,
        items: [
          {
            amount: input.amountCents,
            description: input.description,
            quantity: 1,
            code: input.externalReference,
          },
        ],
        payments: [{ payment_method: 'pix', pix: { expires_in: 1800 } }],
      },
      { 'Idempotency-Key': key },
    )) as any;
    return this.payment(order);
  }
  async getPaymentStatus(credentials: ProviderCredentials, paymentId: string) {
    return this.payment(
      await this.request(
        `/orders/${encodeURIComponent(paymentId)}`,
        'GET',
        credentials,
      ),
    );
  }
  cancelPayment(): Promise<ProviderPayment> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Cancelamento Pagar.me nao foi habilitado nesta etapa.',
      ),
    );
  }
  private payment(order: any): ProviderPayment {
    const transaction = order?.charges?.[0]?.last_transaction;
    if (!order?.id || !order?.status)
      throw new BadGatewayException('Resposta invalida do Pagar.me.');
    return {
      id: String(order.id),
      status: String(order.status),
      qrCode: transaction?.qr_code,
      qrCodeBase64: transaction?.qr_code_url,
    };
  }
  private enabled(name: string) {
    if (process.env[name] !== 'true')
      throw new ServiceUnavailableException('Integracao Pagar.me desativada.');
  }
  private enabledCapabilities() {
    return [
      'API_KEY',
      'SANDBOX',
      ...(process.env.PAGARME_PIX_ENABLED === 'true' ? ['PIX'] : []),
      ...(process.env.PAGARME_CARD_ENABLED === 'true' ? ['ONLINE_CARD'] : []),
    ];
  }
  private async request(
    path: string,
    method: string,
    credentials: ProviderCredentials,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.base}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Basic ${Buffer.from(`${credentials.accessToken}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new BadGatewayException('Pagar.me recusou a operacao.');
      return data;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(
        'Falha temporaria na comunicacao com Pagar.me.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
