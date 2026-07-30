import { OrderStatus } from '@prisma/client';

/** The complete RC-007 state machine (self transitions are idempotent). */
export const ORDER_STATUS_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  pending: [
    OrderStatus.preparing,
    OrderStatus.paid,
    OrderStatus.delivered,
    OrderStatus.canceled,
  ],
  preparing: [OrderStatus.paid, OrderStatus.delivered, OrderStatus.canceled],
  paid: [OrderStatus.delivered, OrderStatus.refunded],
  delivered: [OrderStatus.refunded],
  canceled: [],
  refunded: [],
};

export function sourcesFor(next: OrderStatus): OrderStatus[] {
  return (Object.keys(ORDER_STATUS_TRANSITIONS) as OrderStatus[]).filter(
    (current) => ORDER_STATUS_TRANSITIONS[current].includes(next),
  );
}

export function canTransition(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  return current === next || ORDER_STATUS_TRANSITIONS[current].includes(next);
}
