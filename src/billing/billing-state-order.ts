import { BillingPaymentStatus } from '@prisma/client';

export type BillingStateDecision =
  | { apply: true; reason: 'INITIAL' | 'NEWER' | 'MONOTONIC' | 'TIE_BREAK' }
  | {
      apply: false;
      reason: 'DUPLICATE' | 'OLDER' | 'REGRESSION' | 'TIE_LOST';
    };

/**
 * Payment lifecycle strata, not a claim that every gateway state is globally
 * interchangeable. A settled payment cannot return to a pre-settlement state;
 * post-settlement reversals cannot return to approved. Values only break ties
 * inside those explicit lifecycle rules.
 */
const lifecycle = {
  [BillingPaymentStatus.PENDING]: 0,
  [BillingPaymentStatus.REJECTED]: 1,
  [BillingPaymentStatus.CANCELED]: 2,
  [BillingPaymentStatus.APPROVED]: 3,
  [BillingPaymentStatus.REFUNDED]: 4,
  [BillingPaymentStatus.CHARGEBACK]: 5,
} as const;

export function decideBillingState(
  current: BillingPaymentStatus | null,
  currentAt: Date | null,
  incoming: BillingPaymentStatus,
  incomingAt: Date | null,
): BillingStateDecision {
  if (!current) return { apply: true, reason: 'INITIAL' };
  const time = compareDates(incomingAt, currentAt);
  if (time < 0) return { apply: false, reason: 'OLDER' };
  if (current === incoming) {
    return time > 0
      ? { apply: true, reason: 'NEWER' }
      : { apply: false, reason: 'DUPLICATE' };
  }

  // A missing timestamp never receives invented temporal authority. Both
  // missing and one-sided timestamps therefore use the conservative FSM.
  const currentLevel = lifecycle[current];
  const incomingLevel = lifecycle[incoming];
  if (incomingLevel < currentLevel) {
    return {
      apply: false,
      reason: time === 0 ? 'TIE_LOST' : 'REGRESSION',
    };
  }
  if (incomingLevel === currentLevel) {
    return { apply: false, reason: 'TIE_LOST' };
  }
  return {
    apply: true,
    reason: time === 0 ? 'TIE_BREAK' : time > 0 ? 'NEWER' : 'MONOTONIC',
  };
}

function compareDates(incoming: Date | null, current: Date | null) {
  if (!incoming || !current) return 0;
  return Math.sign(incoming.getTime() - current.getTime());
}
