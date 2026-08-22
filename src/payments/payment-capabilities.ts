import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, PaymentProviderCode } from '@prisma/client';

export type CapabilityAvailability =
  | 'SUPPORTED'
  | 'UNSUPPORTED'
  | 'REQUIRES_APPROVAL'
  | 'REQUIRES_LOCAL_SDK'
  | 'UNKNOWN';
export type PaymentCapability =
  | 'PIX'
  | 'ONLINE_CARD'
  | 'TERMINAL_CARD'
  | 'LIST_TERMINALS'
  | 'START_POS_PAYMENT'
  | 'WEBHOOK'
  | 'REFUND'
  | 'OAUTH'
  | 'API_KEY'
  | 'SANDBOX';

export const PAYMENT_CAPABILITIES: Record<
  PaymentProviderCode,
  Record<PaymentCapability, CapabilityAvailability>
> = {
  MERCADO_PAGO: {
    PIX: 'SUPPORTED',
    ONLINE_CARD: 'SUPPORTED',
    TERMINAL_CARD: 'SUPPORTED',
    LIST_TERMINALS: 'SUPPORTED',
    START_POS_PAYMENT: 'SUPPORTED',
    WEBHOOK: 'SUPPORTED',
    REFUND: 'SUPPORTED',
    OAUTH: 'SUPPORTED',
    API_KEY: 'SUPPORTED',
    SANDBOX: 'SUPPORTED',
  },
  PAGARME: {
    PIX: 'SUPPORTED',
    ONLINE_CARD: 'SUPPORTED',
    TERMINAL_CARD: 'UNSUPPORTED',
    LIST_TERMINALS: 'UNSUPPORTED',
    START_POS_PAYMENT: 'UNSUPPORTED',
    WEBHOOK: 'SUPPORTED',
    REFUND: 'SUPPORTED',
    OAUTH: 'UNKNOWN',
    API_KEY: 'SUPPORTED',
    SANDBOX: 'SUPPORTED',
  },
  STONE: {
    PIX: 'UNKNOWN',
    ONLINE_CARD: 'UNKNOWN',
    TERMINAL_CARD: 'REQUIRES_LOCAL_SDK',
    LIST_TERMINALS: 'REQUIRES_APPROVAL',
    START_POS_PAYMENT: 'REQUIRES_LOCAL_SDK',
    WEBHOOK: 'UNKNOWN',
    REFUND: 'UNKNOWN',
    OAUTH: 'UNKNOWN',
    API_KEY: 'UNKNOWN',
    SANDBOX: 'UNKNOWN',
  },
  PAGBANK: {
    PIX: 'UNKNOWN',
    ONLINE_CARD: 'UNKNOWN',
    TERMINAL_CARD: 'UNKNOWN',
    LIST_TERMINALS: 'UNKNOWN',
    START_POS_PAYMENT: 'UNKNOWN',
    WEBHOOK: 'UNKNOWN',
    REFUND: 'UNKNOWN',
    OAUTH: 'UNKNOWN',
    API_KEY: 'UNKNOWN',
    SANDBOX: 'UNKNOWN',
  },
  ASAAS: {
    PIX: 'UNKNOWN',
    ONLINE_CARD: 'UNKNOWN',
    TERMINAL_CARD: 'UNKNOWN',
    LIST_TERMINALS: 'UNKNOWN',
    START_POS_PAYMENT: 'UNKNOWN',
    WEBHOOK: 'UNKNOWN',
    REFUND: 'UNKNOWN',
    OAUTH: 'UNKNOWN',
    API_KEY: 'UNKNOWN',
    SANDBOX: 'UNKNOWN',
  },
  OTHER: {
    PIX: 'UNKNOWN',
    ONLINE_CARD: 'UNKNOWN',
    TERMINAL_CARD: 'UNKNOWN',
    LIST_TERMINALS: 'UNKNOWN',
    START_POS_PAYMENT: 'UNKNOWN',
    WEBHOOK: 'UNKNOWN',
    REFUND: 'UNKNOWN',
    OAUTH: 'UNKNOWN',
    API_KEY: 'UNKNOWN',
    SANDBOX: 'UNKNOWN',
  },
};

export function capabilityForMethod(method: PaymentMethod): PaymentCapability {
  if (method === PaymentMethod.PIX) return 'PIX';
  if (method === PaymentMethod.ONLINE_CARD) return 'ONLINE_CARD';
  return method === PaymentMethod.TERMINAL_CARD
    ? 'START_POS_PAYMENT'
    : ('UNKNOWN' as PaymentCapability);
}
export function requireCapability(
  provider: PaymentProviderCode,
  capability: PaymentCapability,
) {
  if (PAYMENT_CAPABILITIES[provider][capability] !== 'SUPPORTED')
    throw new BadRequestException(
      `A capacidade ${capability} nao esta disponivel para ${provider}.`,
    );
}
