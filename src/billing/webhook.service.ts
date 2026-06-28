import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  GatewayWebhookProcessingStatus,
  PaymentGatewayProvider,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { GatewayWebhookInput } from './gateways/payment-gateway.interface';
import { PaymentsService } from './payments.service';

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly payments: PaymentsService,
  ) {}

  async handleMercadoPago(input: GatewayWebhookInput) {
    const provider = PaymentGatewayProvider.MERCADO_PAGO;
    const gateway = this.gateways.get(provider);
    const signatureValid = gateway.validateWebhookSignature(input);
    const eventId = this.string(input.body.id);
    const resourceId =
      this.string((input.body.data as any)?.id) ||
      this.string(input.query['data.id']);
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(input.body))
      .digest('hex');

    const duplicate = eventId
      ? await this.prisma.gatewayWebhookEvent.findFirst({
          where: { provider, gatewayEventId: eventId },
        })
      : await this.prisma.gatewayWebhookEvent.findFirst({
          where: { provider, payloadHash },
        });
    if (
      duplicate &&
      (duplicate.processingStatus === GatewayWebhookProcessingStatus.PROCESSED ||
        duplicate.processingStatus === GatewayWebhookProcessingStatus.IGNORED)
    ) {
      return { received: true, duplicate: true };
    }

    const event =
      duplicate ??
      (await this.prisma.gatewayWebhookEvent.create({
        data: {
          provider,
          gatewayEventId: eventId,
          resourceId,
          eventType:
            this.string(input.body.type) || this.string(input.body.action),
          requestId: this.header(input.headers, 'x-request-id'),
          signatureValid,
          payloadHash,
          rawPayload: this.sanitize(input.body),
          processingStatus: signatureValid
            ? GatewayWebhookProcessingStatus.RECEIVED
            : GatewayWebhookProcessingStatus.IGNORED,
        },
      }));

    if (!signatureValid || process.env.BILLING_WEBHOOK_ENABLED?.toLowerCase() === 'false') {
      throw new UnauthorizedException('Webhook Mercado Pago nao autenticado.');
    }
    if (!resourceId) {
      await this.fail(event.id, 'RESOURCE_ID_MISSING');
      return { received: true, processed: false };
    }

    try {
      const payment = await gateway.getPaymentStatus(resourceId);
      const result = await this.payments.processVerifiedPayment(provider, payment);
      await this.prisma.gatewayWebhookEvent.update({
        where: { id: event.id },
        data: {
          processingStatus: result.processed
            ? GatewayWebhookProcessingStatus.PROCESSED
            : GatewayWebhookProcessingStatus.IGNORED,
          processedAt: new Date(),
          attemptCount: { increment: 1 },
          processingError:
            result.processed || !('reason' in result) ? null : result.reason,
        },
      });
      return { received: true, processed: result.processed };
    } catch (error) {
      await this.fail(event.id, error instanceof Error ? error.message : 'UNKNOWN');
      throw error;
    }
  }

  private fail(id: string, message: string) {
    return this.prisma.gatewayWebhookEvent.update({
      where: { id },
      data: {
        processingStatus: GatewayWebhookProcessingStatus.FAILED,
        processingError: message.slice(0, 500),
        attemptCount: { increment: 1 },
      },
    });
  }

  private sanitize(body: Record<string, unknown>) {
    return {
      id: body.id,
      type: body.type,
      action: body.action,
      api_version: body.api_version,
      live_mode: body.live_mode,
      date_created: body.date_created,
      data: body.data,
    } as Prisma.InputJsonValue;
  }

  private string(value: unknown) {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : null;
  }

  private header(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ) {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
