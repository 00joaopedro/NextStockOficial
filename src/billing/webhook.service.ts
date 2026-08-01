import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  GatewayWebhookEvent,
  GatewayWebhookProcessingStatus as Status,
  PaymentGatewayProvider,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  GatewayPaymentResult,
  GatewayWebhookInput,
} from './gateways/payment-gateway.interface';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { PaymentsService } from './payments.service';

const LEASE_MS = 60_000;

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

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
      this.string((input.body.data as Record<string, unknown>)?.id) ||
      this.string(input.query['data.id']);
    const eventType =
      this.string(input.body.type) || this.string(input.body.action);
    const canonicalPayload = this.canonicalJson(input.body);
    const payloadHash = this.hash(canonicalPayload);
    const accountScope = this.accountScope();
    const identityKey = this.identity(
      provider,
      accountScope,
      eventId,
      eventType,
      resourceId,
      payloadHash,
    );

    // Reject before touching the shared inbox: an unauthenticated request must
    // never be able to reserve/poison a provider-owned event identity.
    if (!signatureValid || process.env.BILLING_WEBHOOK_ENABLED === 'false')
      throw new UnauthorizedException('Webhook Mercado Pago nao autenticado.');

    const event = await this.persist({
      provider,
      gatewayEventId: eventId,
      resourceId,
      eventType,
      requestId: this.header(input.headers, 'x-request-id'),
      signatureValid,
      payloadHash,
      identityKey,
      accountScope,
      rawPayload: this.sanitize(input.body),
      processingStatus: Status.RECEIVED,
    });

    if (event.payloadHash !== payloadHash) {
      this.logger.warn(`webhook identity payload conflict event=${event.id}`);
      throw new ConflictException('Webhook identity conflicts with payload.');
    }
    const claim = await this.claim(event);
    if (!claim) return this.duplicateResponse(event.id);
    if (!resourceId) {
      await this.finish(claim, Status.FAILED_FINAL, 'RESOURCE_ID_MISSING');
      return { received: true, processed: false };
    }
    if (
      !String(eventType || '')
        .toLowerCase()
        .includes('payment')
    ) {
      await this.finish(claim, Status.IGNORED, 'NON_PAYMENT_EVENT');
      return { received: true, processed: false };
    }

    let payment: GatewayPaymentResult;
    try {
      // Authoritative provider I/O is deliberately outside a DB transaction.
      payment = await gateway.getPaymentStatus(resourceId);
    } catch (error) {
      await this.finish(
        claim,
        Status.FAILED_RETRYABLE,
        this.safeErrorCode(error),
      );
      throw error;
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const owned = await tx.gatewayWebhookEvent.findFirst({
          where: {
            id: claim.id,
            provider,
            processingStatus: Status.PROCESSING,
            claimToken: claim.claimToken,
          },
        });
        if (!owned) return null;
        const processed = await this.payments.processVerifiedPayment(
          provider,
          payment,
          'gateway_webhook',
          tx,
        );
        const finalized = await tx.gatewayWebhookEvent.updateMany({
          where: {
            id: claim.id,
            provider,
            processingStatus: Status.PROCESSING,
            claimToken: claim.claimToken,
          },
          data: {
            processingStatus: processed.processed
              ? Status.PROCESSED
              : Status.IGNORED,
            processedAt: new Date(),
            leaseExpiresAt: null,
            processingError:
              processed.processed || !('reason' in processed)
                ? null
                : processed.reason,
            failureCode: null,
          },
        });
        if (finalized.count !== 1) throw new Error('WEBHOOK_CLAIM_LOST');
        return processed;
      });
      if (!result) {
        this.logger.warn(`stale webhook attempt rejected event=${claim.id}`);
        return this.duplicateResponse(claim.id);
      }
      this.logger.log(`webhook processing completed event=${claim.id}`);
      return { received: true, processed: result.processed };
    } catch (error) {
      await this.finish(
        claim,
        Status.FAILED_RETRYABLE,
        this.safeErrorCode(error),
      );
      throw error;
    }
  }

  private async persist(data: Prisma.GatewayWebhookEventCreateInput) {
    try {
      return await this.prisma.gatewayWebhookEvent.create({ data });
    } catch (error) {
      if (!this.isP2002(error)) throw error;
      this.logger.log('webhook P2002 converted to duplicate');
      return this.prisma.gatewayWebhookEvent.findUniqueOrThrow({
        where: { identityKey: data.identityKey as string },
      });
    }
  }

  private async claim(event: GatewayWebhookEvent) {
    const now = new Date();
    const claimToken = randomUUID();
    const acquired = await this.prisma.gatewayWebhookEvent.updateMany({
      where: {
        id: event.id,
        provider: event.provider,
        OR: [
          { processingStatus: Status.RECEIVED },
          { processingStatus: Status.FAILED },
          { processingStatus: Status.FAILED_RETRYABLE },
          {
            processingStatus: Status.PROCESSING,
            leaseExpiresAt: { lte: now },
          },
        ],
      },
      data: {
        processingStatus: Status.PROCESSING,
        claimToken,
        claimedAt: now,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        attemptCount: { increment: 1 },
        processingError: null,
        failureCode: null,
      },
    });
    if (acquired.count !== 1) return null;
    this.logger.log(`webhook claim acquired event=${event.id}`);
    return { id: event.id, claimToken };
  }

  private async duplicateResponse(id: string) {
    const winner = await this.prisma.gatewayWebhookEvent.findUniqueOrThrow({
      where: { id },
    });
    this.logger.log(
      `webhook duplicate ignored event=${id} state=${winner.processingStatus}`,
    );
    return { received: true, duplicate: true, processed: false };
  }

  private async finish(
    claim: { id: string; claimToken: string },
    status: Status,
    code: string,
  ) {
    const result = await this.prisma.gatewayWebhookEvent.updateMany({
      where: {
        id: claim.id,
        provider: PaymentGatewayProvider.MERCADO_PAGO,
        processingStatus: Status.PROCESSING,
        claimToken: claim.claimToken,
      },
      data: {
        processingStatus: status,
        processedAt:
          status === Status.PROCESSED ||
          status === Status.IGNORED ||
          status === Status.FAILED_FINAL
            ? new Date()
            : null,
        leaseExpiresAt: null,
        failureCode: code,
        processingError: code.slice(0, 500),
      },
    });
    if (result.count !== 1)
      this.logger.warn(`stale webhook attempt rejected event=${claim.id}`);
    return result.count === 1;
  }

  private identity(
    provider: PaymentGatewayProvider,
    accountScope: string,
    eventId: string | null,
    eventType: string | null,
    resourceId: string | null,
    payloadHash: string,
  ) {
    return this.hash(
      eventId
        ? `${provider}\n${accountScope}\nid\n${eventId}`
        : `${provider}\n${accountScope}\nfallback\n${eventType || ''}\n${resourceId || ''}\n${payloadHash}`,
    );
  }

  private accountScope() {
    return this.hash(
      process.env.MERCADO_PAGO_COLLECTOR_ID?.trim() || 'platform',
    );
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object')
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.canonicalJson((value as Record<string, unknown>)[key])}`,
        )
        .join(',')}}`;
    return JSON.stringify(value) ?? 'null';
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private isP2002(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
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

  private safeErrorCode(error: unknown) {
    if (!error || typeof error !== 'object') return 'UNKNOWN';
    const name =
      'name' in error && typeof error.name === 'string'
        ? error.name
        : 'WebhookProcessingError';
    return name.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'UNKNOWN';
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
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
