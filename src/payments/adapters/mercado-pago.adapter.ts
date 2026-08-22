import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PaymentProviderCode } from '@prisma/client';
import {
  OAuthPaymentProviderAdapter,
  PaymentProviderAdapter,
  PixPaymentProviderAdapter,
  ProviderCredentials,
  ProviderPayment,
  TerminalPaymentProviderAdapter,
  WebhookPaymentProviderAdapter,
} from '../ports/payment-provider.interface';

@Injectable()
export class MercadoPagoAdapter
  implements
    PaymentProviderAdapter,
    OAuthPaymentProviderAdapter,
    PixPaymentProviderAdapter,
    TerminalPaymentProviderAdapter,
    WebhookPaymentProviderAdapter
{
  readonly code = PaymentProviderCode.MERCADO_PAGO;
  private readonly base = 'https://api.mercadopago.com';
  buildAuthorizationUrl(state: string) {
    const id = process.env.MERCADO_PAGO_CLIENT_ID || '';
    const redirect = process.env.MERCADO_PAGO_OAUTH_REDIRECT_URI || '';
    return `https://auth.mercadopago.com/authorization?client_id=${encodeURIComponent(id)}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}`;
  }
  async exchangeAuthorizationCode(code: string, redirectUri: string) {
    return this.oauth({
      client_secret: process.env.MERCADO_PAGO_CLIENT_SECRET,
      client_id: process.env.MERCADO_PAGO_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
  }
  async refreshCredentials(c: ProviderCredentials) {
    return this.oauth({
      client_secret: process.env.MERCADO_PAGO_CLIENT_SECRET,
      client_id: process.env.MERCADO_PAGO_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: c.refreshToken,
    });
  }
  async revokeConnection(c: ProviderCredentials) {
    await this.request('/users/me', 'DELETE', c);
  }
  async validateConnection(c: ProviderCredentials) {
    const me = (await this.request('/users/me', 'GET', c)) as any;
    return {
      externalAccountId: String(me.id),
      capabilities: ['PIX', 'ONLINE_CARD', 'TERMINAL_CARD'],
    };
  }
  async listTerminals(c: ProviderCredentials) {
    const data = (await this.request(
      '/point/integration-api/devices?offset=0&limit=50',
      'GET',
      c,
    )) as any;
    return data.devices || [];
  }
  async synchronizeTerminal(c: ProviderCredentials, id: string) {
    return this.request(
      `/point/integration-api/devices/${encodeURIComponent(id)}`,
      'GET',
      c,
    ) as Promise<Record<string, unknown>>;
  }
  async createPixPayment(
    c: ProviderCredentials,
    input: {
      amountCents: number;
      externalReference: string;
      description: string;
    },
    key: string,
  ) {
    const data = (await this.request(
      '/v1/payments',
      'POST',
      c,
      {
        transaction_amount: input.amountCents / 100,
        description: input.description,
        payment_method_id: 'pix',
        external_reference: input.externalReference,
      },
      { 'X-Idempotency-Key': key },
    )) as any;
    return this.payment(data);
  }
  async createTerminalPayment(
    c: ProviderCredentials,
    input: Record<string, unknown>,
    key: string,
  ) {
    const data = (await this.request(
      '/point/integration-api/payment-intents',
      'POST',
      c,
      input,
      { 'X-Idempotency-Key': key },
    )) as any;
    return this.payment(data);
  }
  async getPaymentStatus(c: ProviderCredentials, id: string) {
    return this.payment(
      (await this.request(
        `/v1/payments/${encodeURIComponent(id)}`,
        'GET',
        c,
      )) as any,
    );
  }
  async cancelPayment(c: ProviderCredentials, id: string) {
    return this.payment(
      (await this.request(`/v1/payments/${encodeURIComponent(id)}`, 'PUT', c, {
        status: 'cancelled',
      })) as any,
    );
  }
  verifyWebhookSignature(i: {
    signature?: string;
    requestId?: string;
    dataId: string;
    secret: string;
  }) {
    const parts = Object.fromEntries(
      String(i.signature || '')
        .split(',')
        .map((x) => x.trim().split('=')),
    );
    if (!parts.ts || !parts.v1 || !i.requestId || !i.secret) return false;
    const digest = createHmac('sha256', i.secret)
      .update(`id:${i.dataId};request-id:${i.requestId};ts:${parts.ts};`)
      .digest('hex');
    const a = Buffer.from(digest);
    const b = Buffer.from(parts.v1);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  parseWebhook(payload: any) {
    const resourceId = String(payload?.data?.id || '');
    return {
      eventId: String(payload?.id || `${payload?.type}:${resourceId}`),
      resourceId,
    };
  }
  fetchAuthoritativeResource(c: ProviderCredentials, id: string) {
    return this.getPaymentStatus(c, id);
  }
  private payment(d: any): ProviderPayment {
    return {
      id: String(d.id),
      status: String(d.status || d.state || 'unknown'),
      qrCode: d.point_of_interaction?.transaction_data?.qr_code,
      qrCodeBase64: d.point_of_interaction?.transaction_data?.qr_code_base64,
    };
  }
  private async oauth(body: any): Promise<ProviderCredentials> {
    const r = await fetch(`${this.base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok)
      throw new BadGatewayException('Mercado Pago recusou a autorizacao.');
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      publicKey: d.public_key,
    };
  }
  private async request(
    path: string,
    method: string,
    c: ProviderCredentials,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const r = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${c.accessToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok)
      throw new BadGatewayException(
        'Falha na comunicacao com o provedor de pagamento.',
      );
    return d;
  }
}
