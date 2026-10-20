import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { PaymentGatewayProvider } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PaymentGatewayRegistry } from '../../src/billing/gateways/payment-gateway.registry';
import { PaymentsService } from '../../src/billing/payments.service';

import {
  RecoveryValidationError,
  recoveryFailureCode,
} from '../../src/billing/payment-recovery-errors';

async function main() {
  const tenantId = process.env.BILLING_RECOVERY_TENANT_ID || '';
  const paymentId = process.env.BILLING_RECOVERY_PAYMENT_ID || '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tenantId,
    ) ||
    !/^\d{1,30}$/.test(paymentId)
  )
    throw new RecoveryValidationError('INVALID_INPUT');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const prisma = app.get(PrismaService);
    const result = await app
      .get(PaymentGatewayRegistry)
      .get(PaymentGatewayProvider.MERCADO_PAGO)
      .syncPayment(paymentId);
    if (
      result.gatewayPaymentId !== paymentId ||
      result.normalizedStatus !== 'APPROVED' ||
      !result.externalReference ||
      !result.paidAt
    )
      throw new RecoveryValidationError('PAYMENT_NOT_ELIGIBLE');
    const checkout = await prisma.checkoutSession.findFirst({
      where: {
        tenantId,
        provider: PaymentGatewayProvider.MERCADO_PAGO,
        externalReference: result.externalReference,
      },
      include: { subscription: true },
    });
    if (
      !checkout ||
      !checkout.subscription ||
      checkout.expectedAmountCents !== result.amountCents ||
      checkout.currency !== result.currency ||
      !checkout.gatewayCheckoutId ||
      checkout.gatewayCheckoutId !==
        checkout.subscription.gatewaySubscriptionId ||
      (result.gatewaySubscriptionId &&
        result.gatewaySubscriptionId !== checkout.gatewayCheckoutId)
    )
      throw new RecoveryValidationError('PAYMENT_CORRELATION_FAILED');
    const applied = await app
      .get(PaymentsService)
      .processVerifiedPayment(
        PaymentGatewayProvider.MERCADO_PAGO,
        result,
        'manual_recovery',
      );
    process.stdout.write(`${JSON.stringify({ result: applied })}\n`);
  } finally {
    await app.close();
  }
}
if (require.main === module)
  void main().catch((error: unknown) => {
    process.stderr.write(
      `RECOVERY_FAILED code=${recoveryFailureCode(error)}\n`,
    );
    process.exitCode = 1;
  });
