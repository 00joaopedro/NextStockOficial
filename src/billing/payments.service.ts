import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingEventType,
  BillingInvoiceStatus,
  BillingPaymentStatus,
  BillingRefundIntentState,
  PartnerPaymentSource,
  PartnerPaymentStatus,
  PartnerReferralStatus,
  CheckoutSessionStatus,
  PaymentGatewayProvider,
  PlanInterval,
  Prisma,
  PromotionReservationStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingEventsService } from './billing-events.service';
import { decideBillingState } from './billing-state-order';
import { isValidBillingExternalReference } from './external-reference.util';
import {
  GatewayCheckoutError,
  GatewayPaymentResult,
} from './gateways/payment-gateway.interface';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { PRODUCTION_TEST_PLAN_SLUG } from './production-test-access';

class BillingCasLostError extends Error {}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BillingEventsService,
    private readonly gateways?: PaymentGatewayRegistry,
  ) {}

  async productionTestRefundCapability(tenantId: string) {
    const payment = await this.prisma.billingPayment.findFirst({
      where: {
        tenantId,
        status: BillingPaymentStatus.APPROVED,
        plan: { slug: PRODUCTION_TEST_PLAN_SLUG },
        subscription: {
          is: { plan: { slug: PRODUCTION_TEST_PLAN_SLUG } },
        },
        amountCents: 100,
        currency: 'BRL',
      },
      orderBy: { paidAt: 'desc' },
      select: { id: true, amountCents: true, currency: true },
    });
    if (!payment) {
      return {
        enabled: false,
        visible: false,
        action: 'NONE' as const,
        amountCents: null,
        currency: null,
        refundState: null,
      };
    }
    const intent = await this.prisma.billingRefundIntent.findUnique({
      where: {
        tenantId_paymentId_operation: {
          tenantId,
          paymentId: payment.id,
          operation: 'REFUND',
        },
      },
      select: { state: true, failureCode: true },
    });
    const state = intent?.state ?? null;
    const action =
      state === BillingRefundIntentState.FAILED_RETRYABLE
        ? ('RETRY' as const)
        : state === BillingRefundIntentState.UNKNOWN
          ? ('RECONCILE' as const)
          : state || null
            ? ('NONE' as const)
            : ('REQUEST' as const);
    return {
      enabled:
        action === 'REQUEST' || action === 'RETRY' || action === 'RECONCILE',
      visible:
        action !== 'NONE' || state === BillingRefundIntentState.FAILED_FINAL,
      action,
      amountCents: payment.amountCents,
      currency: payment.currency,
      refundState: state,
      diagnostic: intent?.failureCode ?? null,
    };
  }

  async refundProductionTestForTenant(tenantId: string) {
    const payment = await this.prisma.billingPayment.findFirst({
      where: {
        tenantId,
        status: BillingPaymentStatus.APPROVED,
        plan: { slug: PRODUCTION_TEST_PLAN_SLUG },
        subscription: {
          is: { plan: { slug: PRODUCTION_TEST_PLAN_SLUG } },
        },
        amountCents: 100,
        currency: 'BRL',
      },
      orderBy: { paidAt: 'desc' },
      select: { id: true },
    });
    if (!payment) {
      throw new ConflictException(
        'Não existe pagamento aprovado do teste de R$ 1,00 elegível para estorno.',
      );
    }
    return this.refundForTenant(tenantId, payment.id, {
      resolveGatewayPayment: true,
    });
  }

  async refundForTenant(
    tenantId: string,
    paymentId: string,
    options: { resolveGatewayPayment?: boolean } = {},
  ) {
    const payment = await this.prisma.billingPayment.findFirst({
      where: { id: paymentId, tenantId },
      include: {
        subscription: {
          select: { gatewaySubscriptionId: true },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado.');
    }
    if (!payment.gatewayPaymentId || !this.gateways) {
      throw new ConflictException(
        'Pagamento sem operação Mercado Pago disponível.',
      );
    }

    const gateway = this.gateways.get(payment.provider);
    const existingIntent = await this.prisma.billingRefundIntent.findUnique({
      where: {
        tenantId_paymentId_operation: {
          tenantId,
          paymentId: payment.id,
          operation: 'REFUND',
        },
      },
    });
    if (existingIntent?.state === BillingRefundIntentState.SUCCEEDED) {
      return {
        accepted: true,
        status: existingIntent.state,
        paymentId: payment.id,
        refundIntentId: existingIntent.id,
        idempotentReplay: true,
      };
    }
    if (existingIntent?.state === BillingRefundIntentState.UNKNOWN) {
      const reconciled = await this.reconcileRefundIntent(
        payment,
        existingIntent,
        gateway,
        options.resolveGatewayPayment === true,
      );
      if (reconciled) return reconciled;
      return {
        accepted: false,
        status: existingIntent.state,
        paymentId: payment.id,
        refundIntentId: existingIntent.id,
        idempotentReplay: true,
      };
    }
    if (existingIntent?.state === BillingRefundIntentState.FAILED_FINAL) {
      return {
        accepted: false,
        status: existingIntent.state,
        paymentId: payment.id,
        refundIntentId: existingIntent.id,
        idempotentReplay: true,
      };
    }
    if (payment.status !== BillingPaymentStatus.APPROVED && !existingIntent) {
      throw new ConflictException(
        'Pagamento não está aprovado para reembolso.',
      );
    }

    const claimToken = randomUUID();
    let intent:
      | {
          id: string;
          claimToken: string;
          state: BillingRefundIntentState;
        }
      | undefined;
    if (existingIntent) {
      if (existingIntent.state === BillingRefundIntentState.FAILED_RETRYABLE) {
        const retried = await this.prisma.billingRefundIntent.updateMany({
          where: {
            id: existingIntent.id,
            state: BillingRefundIntentState.FAILED_RETRYABLE,
          },
          data: {
            claimToken,
            state: BillingRefundIntentState.PROCESSING,
            leaseExpiresAt: new Date(Date.now() + 60_000),
            failureCode: null,
          },
        });
        if (retried.count !== 1) {
          throw new ConflictException(
            'Reembolso foi atualizado por outra solicitação.',
          );
        }
        intent = {
          id: existingIntent.id,
          claimToken,
          state: BillingRefundIntentState.PROCESSING,
        };
      } else {
        const expired = existingIntent.leaseExpiresAt <= new Date();
        if (!expired) {
          throw new ConflictException(
            'Reembolso já está em processamento; não será feita uma segunda chamada ao gateway.',
          );
        }
        if (existingIntent.state === BillingRefundIntentState.CLAIMED) {
          const reclaimed = await this.prisma.billingRefundIntent.updateMany({
            where: {
              id: existingIntent.id,
              claimToken: existingIntent.claimToken,
              state: BillingRefundIntentState.CLAIMED,
              leaseExpiresAt: { lte: new Date() },
            },
            data: {
              claimToken,
              state: BillingRefundIntentState.PROCESSING,
              leaseExpiresAt: new Date(Date.now() + 60_000),
            },
          });
          if (reclaimed.count !== 1) {
            throw new ConflictException(
              'Claim de reembolso expirou ou foi substituído.',
            );
          }
          intent = {
            id: existingIntent.id,
            claimToken,
            state: BillingRefundIntentState.PROCESSING,
          };
        } else if (
          existingIntent.state === BillingRefundIntentState.PROCESSING
        ) {
          const fenced = await this.prisma.billingRefundIntent.updateMany({
            where: {
              id: existingIntent.id,
              claimToken: existingIntent.claimToken,
              state: BillingRefundIntentState.PROCESSING,
              leaseExpiresAt: { lte: new Date() },
            },
            data: {
              state: BillingRefundIntentState.UNKNOWN,
              failureCode: 'EXPIRED_CLAIM_RECONCILIATION_REQUIRED',
            },
          });
          if (fenced.count !== 1) {
            throw new ConflictException(
              'Claim de reembolso expirou ou foi substituído.',
            );
          }
          const reconciled = await this.reconcileRefundIntent(
            payment,
            { ...existingIntent, state: BillingRefundIntentState.UNKNOWN },
            gateway,
          );
          return (
            reconciled ?? {
              accepted: false,
              status: BillingRefundIntentState.UNKNOWN,
              paymentId: payment.id,
              refundIntentId: existingIntent.id,
              idempotentReplay: true,
            }
          );
        } else {
          throw new ConflictException(
            'Estado de reembolso não pode ser retomado automaticamente.',
          );
        }
      }
    } else {
      try {
        intent = await this.prisma.billingRefundIntent.create({
          data: {
            tenantId,
            paymentId: payment.id,
            provider: payment.provider,
            claimToken,
            leaseExpiresAt: new Date(Date.now() + 60_000),
          },
          select: { id: true, claimToken: true, state: true },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        const current = await this.prisma.billingRefundIntent.findUniqueOrThrow(
          {
            where: {
              tenantId_paymentId_operation: {
                tenantId,
                paymentId: payment.id,
                operation: 'REFUND',
              },
            },
          },
        );
        if (current.state === BillingRefundIntentState.SUCCEEDED) {
          return {
            accepted: true,
            status: current.state,
            paymentId: payment.id,
            refundIntentId: current.id,
            idempotentReplay: true,
          };
        }
        if (current.state === BillingRefundIntentState.UNKNOWN) {
          const reconciled = await this.reconcileRefundIntent(
            payment,
            current,
            gateway,
          );
          return (
            reconciled ?? {
              accepted: false,
              status: current.state,
              paymentId: payment.id,
              refundIntentId: current.id,
              idempotentReplay: true,
            }
          );
        }
        throw new ConflictException(
          'Reembolso já está em processamento; não será feita uma segunda chamada ao gateway.',
        );
      }
    }
    const processing = await this.prisma.billingRefundIntent.updateMany({
      where: {
        id: intent.id,
        claimToken,
        state: BillingRefundIntentState.CLAIMED,
      },
      data: { state: BillingRefundIntentState.PROCESSING },
    });
    if (processing.count !== 1) {
      throw new ConflictException(
        'Claim de reembolso expirou ou foi substituído.',
      );
    }

    try {
      await gateway.refundPayment(payment.gatewayPaymentId);
      const verified = await gateway.getPaymentStatus(payment.gatewayPaymentId);
      const localResult = await this.processVerifiedPayment(
        payment.provider,
        verified,
        'refund_api',
      );
      if (verified.normalizedStatus !== 'REFUNDED') {
        await this.markRefundUnknown(
          intent.id,
          claimToken,
          'GATEWAY_REFUND_PENDING',
        );
        return {
          accepted: false,
          status: BillingRefundIntentState.UNKNOWN,
          paymentId: payment.id,
          refundIntentId: intent.id,
          localResult,
        };
      }
      const completed = await this.prisma.billingRefundIntent.updateMany({
        where: {
          id: intent.id,
          claimToken,
          state: BillingRefundIntentState.PROCESSING,
        },
        data: { state: BillingRefundIntentState.SUCCEEDED, failureCode: null },
      });
      if (completed.count !== 1) {
        throw new ConflictException(
          'Claim de reembolso expirou após a confirmação.',
        );
      }
      return {
        accepted: true,
        status: BillingRefundIntentState.SUCCEEDED,
        paymentId: payment.id,
        refundIntentId: intent.id,
        localResult,
      };
    } catch (error) {
      if (error instanceof GatewayCheckoutError) {
        const state = this.refundFailureState(error);
        await this.markRefundState(
          intent.id,
          claimToken,
          state,
          error.failureCode,
        );
        return {
          accepted: false,
          status: state,
          paymentId: payment.id,
          refundIntentId: intent.id,
        };
      }
      await this.markRefundUnknown(
        intent.id,
        claimToken,
        'GATEWAY_RESULT_UNKNOWN',
      );
      throw error;
    }
  }

  private async reconcileRefundIntent(
    payment: {
      id: string;
      tenantId: string;
      provider: PaymentGatewayProvider;
      gatewayPaymentId: string | null;
      externalReference: string;
      amountCents: number;
      currency: string;
      subscription: { gatewaySubscriptionId: string | null } | null;
    },
    intent: { id: string; state: BillingRefundIntentState },
    gateway: {
      getPaymentStatus: (resourceId: string) => Promise<GatewayPaymentResult>;
      findPayments: (
        externalReference: string,
      ) => Promise<GatewayPaymentResult[]>;
    },
    resolveGatewayPayment = false,
  ) {
    if (!payment.gatewayPaymentId) return null;
    let verified: GatewayPaymentResult;
    try {
      verified = await gateway.getPaymentStatus(payment.gatewayPaymentId);
    } catch (error) {
      if (!resolveGatewayPayment) return null;
      return this.resolveRefundPaymentByReference(
        payment,
        intent,
        gateway,
        error,
      );
    }
    if (verified.normalizedStatus !== 'REFUNDED') return null;

    const localResult = await this.processVerifiedPayment(
      payment.provider,
      verified,
      'refund_reconciliation',
    );
    const completed = await this.prisma.billingRefundIntent.updateMany({
      where: { id: intent.id, state: BillingRefundIntentState.UNKNOWN },
      data: {
        state: BillingRefundIntentState.SUCCEEDED,
        failureCode: null,
      },
    });
    return {
      accepted: true,
      status: BillingRefundIntentState.SUCCEEDED,
      paymentId: payment.id,
      refundIntentId: intent.id,
      idempotentReplay: completed.count !== 1,
      localResult,
    };
  }

  private async resolveRefundPaymentByReference(
    payment: {
      id: string;
      tenantId: string;
      provider: PaymentGatewayProvider;
      externalReference: string;
      amountCents: number;
      currency: string;
      subscription: { gatewaySubscriptionId: string | null } | null;
    },
    intent: { id: string; state: BillingRefundIntentState },
    gateway: {
      findPayments: (
        externalReference: string,
      ) => Promise<GatewayPaymentResult[]>;
    },
    lookupError: unknown,
  ) {
    let results: GatewayPaymentResult[];
    try {
      results = await gateway.findPayments(payment.externalReference);
    } catch (error) {
      const diagnostic =
        error instanceof GatewayCheckoutError
          ? `PAYMENT_SEARCH_${error.failureCode}`
          : 'PAYMENT_SEARCH_UNAVAILABLE';
      await this.markExistingRefundState(
        intent.id,
        BillingRefundIntentState.UNKNOWN,
        diagnostic,
      );
      return this.refundDiagnosticResult(payment, intent, diagnostic);
    }

    const candidates = results.filter(
      (result) =>
        result.externalReference === payment.externalReference &&
        result.amountCents === payment.amountCents &&
        result.currency === payment.currency &&
        result.gatewaySubscriptionId ===
          payment.subscription?.gatewaySubscriptionId &&
        ['APPROVED', 'REFUNDED'].includes(result.normalizedStatus),
    );
    if (candidates.length !== 1) {
      const diagnostic =
        candidates.length === 0
          ? 'PAYMENT_RESOLUTION_NOT_FOUND'
          : 'PAYMENT_RESOLUTION_AMBIGUOUS';
      await this.markExistingRefundState(
        intent.id,
        BillingRefundIntentState.UNKNOWN,
        diagnostic,
      );
      return this.refundDiagnosticResult(payment, intent, diagnostic);
    }

    const [resolved] = candidates;
    const saved = await this.prisma.billingPayment.updateMany({
      where: {
        id: payment.id,
        tenantId: payment.tenantId,
        provider: payment.provider,
        externalReference: payment.externalReference,
        amountCents: payment.amountCents,
        currency: payment.currency,
      },
      data: { gatewayPaymentId: resolved.gatewayPaymentId },
    });
    if (saved.count !== 1) {
      await this.markExistingRefundState(
        intent.id,
        BillingRefundIntentState.UNKNOWN,
        'PAYMENT_RESOLUTION_SAVE_CONFLICT',
      );
      return this.refundDiagnosticResult(
        payment,
        intent,
        'PAYMENT_RESOLUTION_SAVE_CONFLICT',
      );
    }

    if (resolved.normalizedStatus === 'REFUNDED') {
      const localResult = await this.processVerifiedPayment(
        payment.provider,
        resolved,
        'refund_reconciliation_reference',
      );
      const completed = await this.prisma.billingRefundIntent.updateMany({
        where: { id: intent.id, state: BillingRefundIntentState.UNKNOWN },
        data: {
          state: BillingRefundIntentState.SUCCEEDED,
          failureCode: null,
        },
      });
      return {
        accepted: true,
        status: BillingRefundIntentState.SUCCEEDED,
        paymentId: payment.id,
        refundIntentId: intent.id,
        idempotentReplay: completed.count !== 1,
        localResult,
      };
    }

    // A previous request may have reached the provider. Once the exact payment
    // is recovered, require an explicit admin retry instead of resending now.
    await this.markExistingRefundState(
      intent.id,
      BillingRefundIntentState.FAILED_RETRYABLE,
      'PAYMENT_RESOLVED_RETRY_REQUIRED',
    );
    return this.refundDiagnosticResult(
      payment,
      intent,
      'PAYMENT_RESOLVED_RETRY_REQUIRED',
      BillingRefundIntentState.FAILED_RETRYABLE,
    );
  }

  private refundDiagnosticResult(
    payment: { id: string },
    intent: { id: string },
    diagnostic: string,
    status: BillingRefundIntentState = BillingRefundIntentState.UNKNOWN,
  ) {
    return {
      accepted: false,
      status,
      paymentId: payment.id,
      refundIntentId: intent.id,
      idempotentReplay: true,
      diagnostic,
    };
  }

  private async markExistingRefundState(
    id: string,
    state: BillingRefundIntentState,
    failureCode: string,
  ) {
    await this.prisma.billingRefundIntent.updateMany({
      where: { id, state: BillingRefundIntentState.UNKNOWN },
      data: { state, failureCode },
    });
  }

  private async markRefundUnknown(
    id: string,
    claimToken: string,
    failureCode: string,
  ) {
    return this.markRefundState(
      id,
      claimToken,
      BillingRefundIntentState.UNKNOWN,
      failureCode,
    );
  }

  private refundFailureState(error: GatewayCheckoutError) {
    return error.checkoutState === 'FAILED_RETRYABLE'
      ? BillingRefundIntentState.FAILED_RETRYABLE
      : error.checkoutState === 'FAILED_FINAL'
        ? BillingRefundIntentState.FAILED_FINAL
        : BillingRefundIntentState.UNKNOWN;
  }

  private async markRefundState(
    id: string,
    claimToken: string,
    state: BillingRefundIntentState,
    failureCode: string,
  ) {
    await this.prisma.billingRefundIntent.updateMany({
      where: { id, claimToken, state: BillingRefundIntentState.PROCESSING },
      data: { state, failureCode },
    });
  }

  async processVerifiedPayment(
    provider: PaymentGatewayProvider,
    result: GatewayPaymentResult,
    source = 'gateway',
    transaction?: Prisma.TransactionClient,
  ) {
    if (!result.externalReference)
      return { processed: false, reason: 'MISSING_EXTERNAL_REFERENCE' };
    if (!isValidBillingExternalReference(result.externalReference))
      return { processed: false, reason: 'INVALID_EXTERNAL_REFERENCE' };

    // Gateway I/O is deliberately performed by the caller before this method.
    // Retry only the short local transaction when an aggregate CAS is lost.
    if (transaction)
      return this.applyWithCas(provider, result, source, transaction);
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
    transaction?: Prisma.TransactionClient,
  ) {
    const apply = async (tx: Prisma.TransactionClient) => {
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
      const preserveCanceledSubscription =
        status === BillingPaymentStatus.APPROVED &&
        checkout.subscription.status === SubscriptionStatus.canceled &&
        checkout.subscription.cancelAtPeriodEnd === true;
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
        // Replays and stale provider events never mutate the payment ledger.
        // Keep a dedicated reconciliation record for deterministic observability.
        await this.events.create(
          {
            tenantId: checkout.tenantId,
            subscriptionId: checkout.subscription.id,
            paymentId: existing?.id,
            checkoutSessionId: checkout.id,
            type: BillingEventType.MANUAL_RECONCILIATION,
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
          ...(preserveCanceledSubscription
            ? {}
            : this.subscriptionState(
                status,
                checkout.planId,
                provider,
                result,
              )),
          lastPaymentState: status,
          lastProviderEventAt: result.providerOccurredAt,
          version: { increment: 1 },
        },
      });
      if (subscriptionClaim.count !== 1) throw new BillingCasLostError();

      const periodStart =
        result.paidAt ?? result.providerOccurredAt ?? new Date();
      const periodEnd = this.periodEnd(periodStart, checkout.plan.interval);
      if (
        status === BillingPaymentStatus.APPROVED &&
        !preserveCanceledSubscription
      ) {
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

      await this.syncPartnerReferral(
        tx,
        checkout.tenantId,
        status,
        checkout.subscription.id,
        `${provider}:${result.gatewayPaymentId}:${status}`,
      );

      if (
        status === BillingPaymentStatus.APPROVED &&
        !preserveCanceledSubscription
      ) {
        await this.convertPromotionReservation(
          tx,
          checkout.tenantId,
          checkout.id,
        );
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
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  private async syncPartnerReferral(
    tx: Prisma.TransactionClient,
    tenantId: string,
    status: BillingPaymentStatus,
    subscriptionId: string,
    providerEventId: string,
  ) {
    const next =
      status === BillingPaymentStatus.APPROVED
        ? {
            paymentStatus: PartnerPaymentStatus.PAID,
            referralStatus: PartnerReferralStatus.CONVERTED,
            reason: 'Pagamento confirmado pela assinatura.',
          }
        : status === BillingPaymentStatus.REFUNDED ||
            status === BillingPaymentStatus.CHARGEBACK
          ? {
              paymentStatus: PartnerPaymentStatus.REFUNDED,
              referralStatus: PartnerReferralStatus.REGISTERED,
              reason: 'Pagamento revertido pelo gateway.',
            }
          : status === BillingPaymentStatus.CANCELED
            ? {
                paymentStatus: PartnerPaymentStatus.CANCELED,
                referralStatus: PartnerReferralStatus.CANCELED,
                reason: 'Pagamento cancelado pelo gateway.',
              }
            : null;
    if (!next) return;

    const referral = await tx.partnerReferral.findFirst({
      where: { referredTenantId: tenantId },
      select: {
        id: true,
        paymentStatus: true,
        status: true,
        convertedAt: true,
      },
    });
    if (!referral) return;
    if (
      referral.paymentStatus === next.paymentStatus &&
      referral.status === next.referralStatus
    ) {
      return;
    }

    const updated = await tx.partnerReferral.updateMany({
      where: {
        id: referral.id,
        paymentStatus: referral.paymentStatus,
        status: referral.status,
      },
      data: {
        paymentStatus: next.paymentStatus,
        status: next.referralStatus,
        convertedAt:
          next.paymentStatus === PartnerPaymentStatus.PAID
            ? (referral.convertedAt ?? new Date())
            : referral.convertedAt,
      },
    });
    if (updated.count !== 1) throw new BillingCasLostError();

    await tx.partnerReferralPaymentEvent.create({
      data: {
        referralId: referral.id,
        previousStatus: referral.paymentStatus,
        newStatus: next.paymentStatus,
        source: PartnerPaymentSource.SUBSCRIPTION_SYNC,
        providerEventId,
        subscriptionId,
        reason: next.reason,
      },
    });
  }

  private async convertPromotionReservation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    checkoutSessionId: string,
  ) {
    const reservation = await tx.promotionReservation.findFirst({
      where: {
        tenantId,
        checkoutSessionId,
        status: PromotionReservationStatus.RESERVED,
      },
    });
    if (!reservation) return;

    const changed = await tx.promotionReservation.updateMany({
      where: {
        id: reservation.id,
        status: PromotionReservationStatus.RESERVED,
      },
      data: {
        status: PromotionReservationStatus.CONVERTED,
        convertedAt: new Date(),
      },
    });
    if (changed.count !== 1) return;

    await tx.$executeRaw(
      Prisma.sql`UPDATE "promotion_campaigns"
        SET "reserved_count" = GREATEST("reserved_count" - 1, 0),
            "converted_count" = "converted_count" + 1,
            "status" = CASE
              WHEN "converted_count" + 1 >= "max_conversions"
              THEN CAST('EXHAUSTED' AS "PromotionCampaignStatus")
              ELSE "status"
            END,
            "closed_at" = CASE
              WHEN "converted_count" + 1 >= "max_conversions"
              THEN COALESCE("closed_at", NOW())
              ELSE "closed_at"
            END,
            "close_reason" = CASE
              WHEN "converted_count" + 1 >= "max_conversions"
              THEN COALESCE("close_reason", 'LIMIT_REACHED')
              ELSE "close_reason"
            END,
            "updated_at" = NOW()
        WHERE "id" = ${reservation.campaignId}`,
    );
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
