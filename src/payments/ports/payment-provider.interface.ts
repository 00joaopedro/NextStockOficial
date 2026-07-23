import { PaymentProviderCode } from '@prisma/client';

export type ProviderCredentials = {
  accessToken: string;
  refreshToken?: string;
  publicKey?: string;
};
export type ProviderPayment = {
  id: string;
  status: string;
  qrCode?: string;
  qrCodeBase64?: string;
};
export interface PaymentProviderAdapter {
  readonly code: PaymentProviderCode;
  validateConnection(
    credentials: ProviderCredentials,
  ): Promise<{ externalAccountId?: string; capabilities: string[] }>;
  getPaymentStatus(
    credentials: ProviderCredentials,
    paymentId: string,
  ): Promise<ProviderPayment>;
  cancelPayment(
    credentials: ProviderCredentials,
    paymentId: string,
  ): Promise<ProviderPayment>;
}
export interface OAuthPaymentProviderAdapter {
  buildAuthorizationUrl(state: string): string;
  exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
  ): Promise<ProviderCredentials>;
  refreshCredentials(
    credentials: ProviderCredentials,
  ): Promise<ProviderCredentials>;
  revokeConnection(credentials: ProviderCredentials): Promise<void>;
}
export interface TerminalPaymentProviderAdapter {
  listTerminals(
    credentials: ProviderCredentials,
  ): Promise<Array<Record<string, unknown>>>;
  synchronizeTerminal(
    credentials: ProviderCredentials,
    externalDeviceId: string,
  ): Promise<Record<string, unknown>>;
  createTerminalPayment(
    credentials: ProviderCredentials,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ProviderPayment>;
}
export interface PixPaymentProviderAdapter {
  createPixPayment(
    credentials: ProviderCredentials,
    input: {
      amountCents: number;
      externalReference: string;
      description: string;
    },
    idempotencyKey: string,
  ): Promise<ProviderPayment>;
}
export interface WebhookPaymentProviderAdapter {
  verifyWebhookSignature(input: {
    signature?: string;
    requestId?: string;
    dataId: string;
    secret: string;
  }): boolean;
  parseWebhook(payload: unknown): { eventId: string; resourceId: string };
  fetchAuthoritativeResource(
    credentials: ProviderCredentials,
    resourceId: string,
  ): Promise<ProviderPayment>;
}
