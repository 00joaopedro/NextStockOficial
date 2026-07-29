import { PaymentGatewayProvider } from '@prisma/client';

export class GatewayCheckoutError extends Error {
  constructor(
    message: string,
    readonly networkStarted: boolean,
  ) {
    super(message);
    this.name = 'GatewayCheckoutError';
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
}
