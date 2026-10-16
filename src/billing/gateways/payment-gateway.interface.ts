import { BadGatewayException } from '@nestjs/common';
import { PaymentGatewayProvider } from '@prisma/client';

export type GatewayCheckoutFailureState =
  'UNKNOWN' | 'FAILED_RETRYABLE' | 'FAILED_FINAL';

export class GatewayCheckoutError extends BadGatewayException {
  constructor(
    message: string,
    readonly networkStarted: boolean,
    readonly details: {
      code: string;
      providerStatus?: number;
      providerRequestId?: string;
      providerDiagnostic?: string;
      state?: GatewayCheckoutFailureState;
    } = { code: 'GATEWAY_ERROR' },
  ) {
    super(message);
    this.name = 'GatewayCheckoutError';
  }

  get failureCode() {
    return this.details.code;
  }

  get providerStatus() {
    return this.details.providerStatus;
  }

  get providerRequestId() {
    return this.details.providerRequestId;
  }

  get providerDiagnostic() {
    return this.details.providerDiagnostic;
  }

  get checkoutState(): GatewayCheckoutFailureState {
    if (this.details.state) return this.details.state;
    return this.networkStarted ? 'UNKNOWN' : 'FAILED_RETRYABLE';
  }
}

export type CreateGatewayCheckoutInput = {
  idempotencyKey: string;
  externalReference: string;
  amountCents: number;
  currency: string;
  title: string;
  paymentLinkUrl?: string | null;
  gatewayPlanId?: string | null;
  payerEmail: string;
  backUrl: string;
};

export type CreateGatewayCheckoutResult = {
  checkoutUrl: string;
  gatewayCheckoutId: string | null;
  supportsExternalReference: boolean;
  gatewaySubscriptionId: string;
};

export type GatewayWebhookInput = {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
};

export type GatewayPaymentResult = {
  gatewayPaymentId: string;
  status: string;
  externalReference: string | null;
  amountCents: number;
  currency: string;
  paidAt: Date | null;
  /** Provider-owned payment update time; null when the provider omits it. */
  providerOccurredAt: Date | null;
  gatewaySubscriptionId: string | null;
  normalizedStatus:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELED'
    | 'REFUNDED'
    | 'CHARGEBACK';
  raw: Record<string, unknown>;
};

export interface PaymentGateway {
  readonly provider: PaymentGatewayProvider;
  /** Replaying create with the same key is an authoritative provider lookup/recovery. */
  readonly supportsIdempotentCheckoutRecovery: boolean;
  createCheckout(
    input: CreateGatewayCheckoutInput,
  ): Promise<CreateGatewayCheckoutResult>;
  validateWebhookSignature(input: GatewayWebhookInput): boolean;
  getPaymentStatus(resourceId: string): Promise<GatewayPaymentResult>;
  syncPayment(resourceId: string): Promise<GatewayPaymentResult>;
  findPayments(externalReference: string): Promise<GatewayPaymentResult[]>;
  cancelSubscription(
    gatewaySubscriptionId: string,
    idempotencyKey?: string,
  ): Promise<void>;
  refundPayment(gatewayPaymentId: string): Promise<void>;
}
