import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import {
  PaymentProviderCode,
  PaymentTransactionStatus,
  PaymentWebhookProcessingStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoAdapter } from './adapters/mercado-pago.adapter';
import { PaymentCredentialsCryptoService } from './payment-credentials-crypto.service';
@Controller('payments/webhooks')
export class PaymentWebhookController {
  constructor(
    private prisma: PrismaService,
    private mp: MercadoPagoAdapter,
    private crypto: PaymentCredentialsCryptoService,
  ) {}
  @Post(':provider') async receive(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    if (provider !== 'mercado-pago')
      throw new BadRequestException('Provedor desconhecido.');
    const parsed = this.mp.parseWebhook(payload);
    if (
      !parsed.resourceId ||
      !this.mp.verifyWebhookSignature({
        signature,
        requestId,
        dataId: parsed.resourceId,
        secret: process.env.MERCADO_PAGO_APP_WEBHOOK_SECRET || '',
      })
    )
      throw new BadRequestException('Assinatura invalida.');
    const hash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    const event = await this.prisma.paymentWebhookEvent.upsert({
      where: {
        providerCode_externalEventId: {
          providerCode: PaymentProviderCode.MERCADO_PAGO,
          externalEventId: parsed.eventId,
        },
      },
      create: {
        providerCode: PaymentProviderCode.MERCADO_PAGO,
        externalEventId: parsed.eventId,
        signatureValidated: true,
        payloadHash: hash,
        sanitizedPayload: {
          type: payload?.type,
          data: { id: parsed.resourceId },
        },
      },
      update: { attempts: { increment: 1 } },
    });
    if (event.status === PaymentWebhookProcessingStatus.PROCESSED)
      return { received: true };
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: {
        providerCode: PaymentProviderCode.MERCADO_PAGO,
        externalPaymentId: parsed.resourceId,
      },
      include: { connection: true },
    });
    if (!transaction?.connection.encryptedCredentials) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { status: 'IGNORED', processedAt: new Date() },
      });
      return { received: true };
    }
    try {
      const credentials = this.crypto.decrypt(
        transaction.connection.encryptedCredentials,
        transaction.tenantId,
        transaction.connectionId,
        transaction.connection.version,
      );
      const authoritative = await this.mp.fetchAuthoritativeResource(
        credentials,
        parsed.resourceId,
      );
      const status =
        authoritative.status === 'approved'
          ? PaymentTransactionStatus.APPROVED
          : authoritative.status === 'rejected'
            ? PaymentTransactionStatus.REJECTED
            : PaymentTransactionStatus.PENDING;
      await this.prisma.$transaction([
        this.prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            status,
            externalStatus: authoritative.status,
            ...(status === PaymentTransactionStatus.APPROVED
              ? { completedAt: new Date() }
              : {}),
          },
        }),
        this.prisma.paymentWebhookEvent.update({
          where: { id: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        }),
      ]);
      return { received: true };
    } catch (e) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED', attempts: { increment: 1 } },
      });
      throw e;
    }
  }
}
