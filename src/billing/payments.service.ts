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
import { decideBillingState } from './billing-state-order';
import { isValidBillingExternalReference } from './external-reference.util';
import { GatewayPaymentResult } from './gateways/payment-gateway.interface';

class BillingCasLostError extends Error {}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BillingEventsService,
  ) {}

  async processVerifiedPayment(
    provider: PaymentGatewayProvider,
    result: GatewayPaymentResult,
    source = 'gateway',
  ) {
    if (!result.externalReference)
      return { processed: false, reason: 'MISSING_EXTERNAL_REFERENCE' };
    if (!isValidBillingExternalReference(result.externalReference))
      return { processed: false, reason: 'INVALID_EXTERNAL_REFERENCE' };

    // Gateway I/O is deliberately performed by the caller before this method.
    // Retry only the short local transaction when an aggregate CAS is lost.
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        return await this.applyWithCas(provider, result, source);
      } catch (error) {
        if (!(error instanceof BillingCasLostError)) throw error;
      }
    }
    throw new ConflictException('Billing CAS contention limit exceeded.');
  }

  private async applyWithCas(
    provider: PaymentGatewayProvider,
    result: GatewayPaymentResult,
    source: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const checkout = await tx.checkoutSession.findUnique({
        where: { externalReference: result.externalReference! },
        include: { plan: true, subscription: true },
      });
      if (!checkout || checkout.provider !== provider)
        return { processed: false, reason: 'CHECKOUT_NOT_FOUND' } as const;
      if (!checkout.subscription)
        return { processed: false, reason: 'SUBSCRIPTION_NOT_FOUND' } as const;
      if (
        result.amountCents !== checkout.expectedAmountCents ||
        result.currency !== checkout.currency
      )
        throw new ConflictException(
          'Pagamento diverge do valor ou moeda esperados.',
        );

      const status = BillingPaymentStatus[result.normalizedStatus];
      const existing = await tx.billingPayment.findFirst({
        where: {
          tenantId: checkout.tenantId,
          provider,
          gatewayPaymentId: result.gatewayPaymentId,
        },
      });
      const currentState =
        existing?.status ?? checkout.subscription.lastPaymentState;
      const currentAt =
        existing?.providerOccurredAt ??
        checkout.subscription.lastProviderEventAt;
      const decision = decideBillingState(
        currentState,
        currentAt,
        status,
        result.providerOccurredAt,
      );
      if (!decision.apply) {
        await this.events.create(
          {
            tenantId: checkout.tenantId,
            subscriptionId: checkout.subscription.id,
            paymentId: existing?.id,
            checkoutSessionId: checkout.id,
            type: this.eventType(status),
            source,
            previousState: {
              status: currentState,
              providerOccurredAt: currentAt,
            },
            nextState: {
              status,
              providerOccurredAt: result.providerOccurredAt,
            },
            metadata: { applied: false, reason: decision.reason },
          },
          tx,
        );
        return {
          processed: true,
          applied: false,
          paymentId: existing?.id,
          status: currentState,
          reason: decision.reason,
        };
      }

      // Subscription is the aggregate lock. The version read above is in the
      // WHERE clause and count must be exactly one; all ledger writes roll back
      // when another Prisma instance wins.
      const subscriptionClaim = await tx.subscription.updateMany({
        where: {
          id: checkout.subscription.id,
          tenantId: checkout.tenantId,
          version: checkout.subscription.version,
        },
        data: {
          ...this.subscriptionState(status, checkout.planId, provider, result),
          lastPaymentState: status,
          lastProviderEventAt: result.providerOccurredAt,
          version: { increment: 1 },
        },
      });
      if (subscriptionClaim.count !== 1) throw new BillingCasLostError();

      const periodStart =
        result.paidAt ?? result.providerOccurredAt ?? new Date();
      const periodEnd = this.periodEnd(periodStart, checkout.plan.interval);
      if (status === BillingPaymentStatus.APPROVED) {
        await tx.subscription.update({
          where: { id: checkout.subscription.id },
          data: { planId: checkout.planId, currentPeriodEndsAt: periodEnd },
        });
      }
      const [invoice] = await tx.$queryRaw<[{ id: string }]>(Prisma.sql`
        INSERT INTO "billing_invoices" (
          "tenant_id", "subscription_id", "plan_id", "provider",
          "gateway_invoice_id", "external_reference", "status",
          "period_started_at", "period_ends_at", "due_at", "amount_cents",
          "currency", "paid_at", "metadata", "last_provider_event_at",
          "last_payment_state"
        ) VALUES (
          ${checkout.tenantId}::uuid, ${checkout.subscription.id}::uuid,
          ${checkout.planId}::uuid,
          ${provider}::"PaymentGatewayProvider", ${result.gatewayPaymentId},
          ${result.externalReference!},
          ${this.invoiceStatus(status)}::"BillingInvoiceStatus",
          ${periodStart}, ${periodEnd}, ${periodStart}, ${result.amountCents},
          ${result.currency},
          ${status === BillingPaymentStatus.APPROVED ? periodStart : null},
          ${JSON.stringify(result.raw)}::jsonb, ${result.providerOccurredAt},
          ${status}::"BillingPaymentStatus"
        )
        ON CONFLICT ("provider", "gateway_invoice_id")
        WHERE "gateway_invoice_id" IS NOT NULL
        DO UPDATE SET
          "status" = EXCLUDED."status",
          "paid_at" = CASE
            WHEN EXCLUDED."status" = 'PAID' THEN EXCLUDED."paid_at"
            ELSE "billing_invoices"."paid_at"
          END,
          "metadata" = EXCLUDED."metadata",
          "last_provider_event_at" = EXCLUDED."last_provider_event_at",
          "last_payment_state" = EXCLUDED."last_payment_state",
          "updated_at" = NOW()
        RETURNING "id"
      `);
      let payment: { id: string };
      if (existing) {
        const paymentClaim = await tx.billingPayment.updateMany({
          where: {
            id: existing.id,
            tenantId: checkout.tenantId,
            version: existing.version,
          },
          data: {
            invoiceId: invoice.id,
            status,
            rawGatewayStatus: result.status,
            paidAt:
              status === BillingPaymentStatus.APPROVED
                ? (result.paidAt ?? existing.paidAt ?? periodStart)
                : existing.paidAt,
            refundedAt: this.isReversal(status)
              ? (result.providerOccurredAt ?? new Date())
              : existing.refundedAt,
            metadata: result.raw as Prisma.InputJsonValue,
            providerOccurredAt: result.providerOccurredAt,
            version: { increment: 1 },
          },
        });
        if (paymentClaim.count !== 1) throw new BillingCasLostError();
        payment = await tx.billingPayment.findUniqueOrThrow({
          where: { id: existing.id },
        });
      } else {
        payment = await tx.billingPayment.create({
          data: {
            tenantId: checkout.tenantId,
            subscriptionId: checkout.subscription.id,
            planId: checkout.planId,
            checkoutSessionId: checkout.id,
            invoiceId: invoice.id,
            provider,
            gatewayPaymentId: result.gatewayPaymentId,
            externalReference: result.externalReference!,
            status,
            amountCents: result.amountCents,
            currency: result.currency,
            rawGatewayStatus: result.status,
            paidAt:
              status === BillingPaymentStatus.APPROVED ? periodStart : null,
            refundedAt: this.isReversal(status)
              ? (result.providerOccurredAt ?? new Date())
              : null,
            metadata: result.raw as Prisma.InputJsonValue,
            providerOccurredAt: result.providerOccurredAt,
          },
        });
      }

      const checkoutStatus = this.checkoutStatus(status, checkout.status);
      await tx.checkoutSession.updateMany({
        where: { id: checkout.id, tenantId: checkout.tenantId },
        data: {
          status: checkoutStatus,
          completedAt:
            checkoutStatus === CheckoutSessionStatus.COMPLETED
              ? (checkout.completedAt ?? new Date())
              : checkout.completedAt,
          lastProviderEventAt: result.providerOccurredAt,
          lastPaymentState: status,
        },
      });
      await this.events.create(
        {
          tenantId: checkout.tenantId,
          subscriptionId: checkout.subscription.id,
          paymentId: payment.id,
          checkoutSessionId: checkout.id,
          type: this.eventType(status),
          source,
          previousState: {
            status: currentState,
            providerOccurredAt: currentAt,
          },
          nextState: { status, providerOccurredAt: result.providerOccurredAt },
          metadata: { applied: true, reason: decision.reason },
        },
        tx,
      );
      if (status === BillingPaymentStatus.APPROVED) {
        await this.events.create(
          {
            tenantId: checkout.tenantId,
            subscriptionId: checkout.subscription.id,
            paymentId: payment.id,
            checkoutSessionId: checkout.id,
            type: BillingEventType.SUBSCRIPTION_ACTIVATED,
            source,
            previousState: { status: checkout.subscription.status },
            nextState: { status: SubscriptionStatus.active },
          },
          tx,
        );
      }
      return { processed: true, applied: true, paymentId: payment.id, status };
    });
  }

  private subscriptionState(
    status: BillingPaymentStatus,
    _planId: string,
    provider: PaymentGatewayProvider,
    result: GatewayPaymentResult,
  ): Prisma.SubscriptionUpdateManyMutationInput {
    if (status === BillingPaymentStatus.APPROVED) {
      const start = result.paidAt ?? result.providerOccurredAt ?? new Date();
      return {
        status: SubscriptionStatus.active,
        gatewayProvider: provider,
        currentPeriodStartedAt: start,
        lastPaymentAt: start,
        graceEndsAt: null,
      };
    }
    if (this.isReversal(status))
      return { status: SubscriptionStatus.suspended };
    return {};
  }

  private checkoutStatus(
    status: BillingPaymentStatus,
    current: CheckoutSessionStatus,
  ) {
    if (status === BillingPaymentStatus.APPROVED)
      return CheckoutSessionStatus.COMPLETED;
    if (status === BillingPaymentStatus.CANCELED)
      return CheckoutSessionStatus.CANCELED;
    if (status === BillingPaymentStatus.REJECTED)
      return CheckoutSessionStatus.FAILED;
    return current === CheckoutSessionStatus.OPEN
      ? CheckoutSessionStatus.PENDING
      : current;
  }

  private isReversal(status: BillingPaymentStatus) {
    return (
      status === BillingPaymentStatus.REFUNDED ||
      status === BillingPaymentStatus.CHARGEBACK
    );
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
    if (status === BillingPaymentStatus.APPROVED)
      return BillingEventType.PAYMENT_APPROVED;
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
