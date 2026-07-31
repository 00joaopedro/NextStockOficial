import { OrderStatus } from '@prisma/client';
import {
  canTransition,
  ORDER_STATUS_TRANSITIONS,
  sourcesFor,
} from './order-status-transitions';

describe('RC-007 order status state machine', () => {
  it('defines every real status exactly once', () => {
    expect(Object.keys(ORDER_STATUS_TRANSITIONS).sort()).toEqual(
      Object.values(OrderStatus).sort(),
    );
  });

  it.each([
    [OrderStatus.pending, OrderStatus.paid, true],
    [OrderStatus.pending, OrderStatus.canceled, true],
    [OrderStatus.pending, OrderStatus.delivered, true],
    [OrderStatus.paid, OrderStatus.delivered, true],
    [OrderStatus.paid, OrderStatus.canceled, false],
    [OrderStatus.canceled, OrderStatus.paid, false],
    [OrderStatus.canceled, OrderStatus.delivered, false],
    [OrderStatus.delivered, OrderStatus.canceled, false],
    [OrderStatus.delivered, OrderStatus.paid, false],
    [OrderStatus.refunded, OrderStatus.pending, false],
    [OrderStatus.delivered, OrderStatus.delivered, true],
  ])('%s -> %s is %s', (current, next, expected) => {
    expect(canTransition(current, next)).toBe(expected);
  });

  it('derives exact CAS source states', () => {
    expect(sourcesFor(OrderStatus.canceled)).toEqual([
      OrderStatus.pending,
      OrderStatus.preparing,
    ]);
    expect(sourcesFor(OrderStatus.delivered)).toEqual([
      OrderStatus.pending,
      OrderStatus.preparing,
      OrderStatus.paid,
    ]);
  });
});
