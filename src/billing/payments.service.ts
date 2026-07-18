import { ConflictException, Injectable } from '@nestjs/common';
import {
  BillingEventType,
  BillingInvoiceStatus,
  BillingPaymentStatus,
  CheckoutSessionStatus,
  PaymentGatewayProvider,
  PlanInterval,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingEventsService } from './billing-events.service';
import { GatewayPaymentResult } from './gateways/payment-gateway.interface';
import { isValidBillingExternalReference } from './external-reference.util';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BillingEventsService,
  ) {}

  async processVerifiedPayment(
    provider: PaymentGatewayProvider,
    result: GatewayPaymentResult,
  ) {
    if (!result.externalReference) {
      return { processed: false, reason: 'MISSING_EXTERNAL_REFERENCE' };
    }
    const externalReference = result.externalReference;
    if (!isValidBillingExternalReference(externalReference)) {
      return { processed: false, reason: 'INVALID_EXTERNAL_REFERENCE' };
    }
    const checkout = await this.prisma.checkoutSession.findUnique({
      where: { externalReference },
      include: { plan: true, subscription: true },
    });
    if (!checkout || checkout.provider !== provider) {
      return { processed: false, reason: 'CHECKOUT_NOT_FOUND' };
    }
    if (!checkout.subscriptionId) {
      return { processed: false, reason: 'SUBSCRIPTION_NOT_FOUND' };
    }
    const subscriptionId = checkout.subscriptionId;
    if (
      result.amountCents !== checkout.expectedAmountCents ||
      result.currency !== checkout.currency
    ) {
      throw new ConflictException(
        'Pagamento diverge do valor ou moeda esperados.',
      );
    }
    const status = BillingPaymentStatus[result.normalizedStatus];

    return this.prisma.$transaction(async (tx) => {
      const periodStart = result.paidAt ?? new Date();
      const periodEnd = this.periodEnd(periodStart, checkout.plan.interval);
      const invoice = await tx.billingInvoice.upsert({
        where: {
          provider_gatewayInvoiceId: {
            provider,
            gatewayInvoiceId: result.gatewayPaymentId,
          },
        },
        update: {
          status: this.invoiceStatus(status),
          paidAt:
            status === BillingPaymentStatus.APPROVED ? periodStart : undefined,
          metadata: result.raw as Prisma.InputJsonValue,
        },
        create: {
          tenantId: checkout.tenantId,
          subscriptionId,
          planId: checkout.planId,
          provider,
          gatewayInvoiceId: result.gatewayPaymentId,
          externalReference,
          status: this.invoiceStatus(status),
          periodStartedAt: periodStart,
          periodEndsAt: periodEnd,
          dueAt: periodStart,
          amountCents: result.amountCents,
          currency: result.currency,
          paidAt: status === BillingPaymentStatus.APPROVED ? periodStart : null,
          metadata: result.raw as Prisma.InputJsonValue,
        },
      });
      const existing = await tx.billingPayment.findFirst({
        where: { provider, gatewayPaymentId: result.gatewayPaymentId },
      });
      const payment = existing
        ? await tx.billingPayment.update({
            where: { id: existing.id },
            data: {
              invoiceId: invoice.id,
              status,
              rawGatewayStatus: result.status,
              paidAt:
                status === BillingPaymentStatus.APPROVED
                  ? (result.paidAt ?? existing.paidAt ?? new Date())
                  : existing.paidAt,
              refundedAt:
                status === BillingPaymentStatus.REFUNDED ? new Date() : null,
              metadata: result.raw as Prisma.InputJsonValue,
            },
          })
        : await tx.billingPayment.create({
            data: {
              tenantId: checkout.tenantId,
              subscriptionId,
              planId: checkout.planId,
              checkoutSessionId: checkout.id,
              invoiceId: invoice.id,
              provider,
              gatewayPaymentId: result.gatewayPaymentId,
              externalReference,
              status,
              amountCents: result.amountCents,
              currency: result.currency,
              rawGatewayStatus: result.status,
              paidAt:
                status === BillingPaymentStatus.APPROVED
                  ? (result.paidAt ?? new Date())
                  : null,
              refundedAt:
                status === BillingPaymentStatus.REFUNDED ? new Date() : null,
              metadata: result.raw as Prisma.InputJsonValue,
            },
          });

      if (status === BillingPaymentStatus.APPROVED) {
        const now = periodStart;
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: {
            planId: checkout.planId,
            status: SubscriptionStatus.active,
            gatewayProvider: provider,
            currentPeriodStartedAt: now,
            currentPeriodEndsAt: periodEnd,
            lastPaymentAt: now,
            graceEndsAt: null,
            version: { increment: 1 },
          },
        });
        await tx.checkoutSession.update({
          where: { id: checkout.id },
          data: {
            status: CheckoutSessionStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        await this.events.create(
          {
            tenantId: checkout.tenantId,
            subscriptionId,
            paymentId: payment.id,
            checkoutSessionId: checkout.id,
            type: BillingEventType.PAYMENT_APPROVED,
            source: 'webhook',
            nextState: { status, planId: checkout.planId },
          },
          tx,
        );
        await this.events.create(
          {
            tenantId: checkout.tenantId,
            subscriptionId,
            paymentId: payment.id,
            checkoutSessionId: checkout.id,
            type: BillingEventType.CHECKOUT_COMPLETED,
            source: 'webhook',
            nextState: { status: CheckoutSessionStatus.COMPLETED },
          },
          tx,
        );
        await this.events.create(
          {
            tenantId: checkout.tenantId,
            subscriptionId,
            paymentId: payment.id,
            checkoutSessionId: checkout.id,
            type: BillingEventType.SUBSCRIPTION_ACTIVATED,
            source: 'webhook',
            previousState: {
              status: checkout.subscription?.status,
              planId: checkout.subscription?.planId,
            },
            nextState: {
              status: SubscriptionStatus.active,
              planId: checkout.planId,
              currentPeriodEndsAt: periodEnd?.toISOString() ?? null,
            },
          },
          tx,
        );
        if (checkout.subscription?.planId !== checkout.planId) {
          await this.events.create(
            {
              tenantId: checkout.tenantId,
              subscriptionId,
              paymentId: payment.id,
              checkoutSessionId: checkout.id,
              type: BillingEventType.PLAN_CHANGED,
              source: 'webhook',
              previousState: { planId: checkout.subscription?.planId },
              nextState: { planId: checkout.planId },
            },
            tx,
          );
        }
      } else {
        if (
          (status === BillingPaymentStatus.REFUNDED ||
            status === BillingPaymentStatus.CHARGEBACK) &&
          subscriptionId
        ) {
          await tx.subscription.update({
            where: { id: subscriptionId },
            data: {
              status: SubscriptionStatus.suspended,
              version: { increment: 1 },
            },
          });
        }
        await this.events.create(
          {
            tenantId: checkout.tenantId,
            subscriptionId,
            paymentId: payment.id,
            checkoutSessionId: checkout.id,
            type: this.eventType(status),
            source: 'webhook',
            nextState: { status },
          },
          tx,
        );
      }
      return { processed: true, paymentId: payment.id, status };
    });
  }

  private periodEnd(start: Date, interval: PlanInterval) {
    if (interval === PlanInterval.LIFETIME) return null;
    const end = new Date(start);
    if (interval === PlanInterval.YEARLY)
      end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    return end;
  }

  private eventType(status: BillingPaymentStatus) {
    if (status === BillingPaymentStatus.REJECTED)
      return BillingEventType.PAYMENT_REJECTED;
    if (status === BillingPaymentStatus.REFUNDED)
      return BillingEventType.PAYMENT_REFUNDED;
    if (status === BillingPaymentStatus.CHARGEBACK)
      return BillingEventType.PAYMENT_CHARGEBACK;
    return BillingEventType.PAYMENT_PENDING;
  }

  private invoiceStatus(status: BillingPaymentStatus): BillingInvoiceStatus {
    if (status === BillingPaymentStatus.APPROVED)
      return BillingInvoiceStatus.PAID;
    if (status === BillingPaymentStatus.REFUNDED)
      return BillingInvoiceStatus.REFUNDED;
    if (status === BillingPaymentStatus.CHARGEBACK)
      return BillingInvoiceStatus.CHARGEBACK;
    if (status === BillingPaymentStatus.CANCELED)
      return BillingInvoiceStatus.VOID;
    return BillingInvoiceStatus.PENDING;
  }
}
