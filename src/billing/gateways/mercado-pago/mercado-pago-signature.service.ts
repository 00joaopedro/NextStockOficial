import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { GatewayWebhookInput } from '../payment-gateway.interface';

@Injectable()
export class MercadoPagoSignatureService {
  validate(input: GatewayWebhookInput) {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
    if (!secret) return false;

    const signature = this.header(input.headers, 'x-signature');
    const requestId = this.header(input.headers, 'x-request-id');
    const dataId = String(input.query['data.id'] ?? '');
    if (!signature || !requestId || !dataId) return false;

    const parts = Object.fromEntries(
      signature.split(',').map((part) => {
        const [key, ...rest] = part.trim().split('=');
        return [key, rest.join('=')];
      }),
    );
    const timestamp = parts.ts;
    const received = parts.v1;
    if (!timestamp || !received || !/^[a-f0-9]{64}$/i.test(received)) return false;
    const timestampMs = Number(timestamp) * 1000;
    const toleranceMs = Number(
      process.env.MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS || 600,
    ) * 1000;
    if (
      !Number.isFinite(timestampMs) ||
      !Number.isFinite(toleranceMs) ||
      toleranceMs < 1_000 ||
      Math.abs(Date.now() - timestampMs) > toleranceMs
    ) {
      return false;
    }

    const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  }

  private header(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
