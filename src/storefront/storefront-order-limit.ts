import { createHash } from 'crypto';

export const STOREFRONT_ACTIVE_ORDER_LIMIT = 3;
export const STOREFRONT_ACTIVE_ORDER_WINDOW_DAYS = 30;

/** Canonical representation accepted by the public checkout DTO. */
export function normalizeStorefrontPhone(value: string): string {
  return value.replace(/\D/g, '').slice(0, 20);
}

/**
 * A stable signed 64-bit key for PostgreSQL's pg_advisory_xact_lock(bigint).
 * A SHA-256 collision can only cause harmless extra serialization; it cannot
 * allow the active-order invariant to be exceeded.
 */
export function storefrontOrderLimitLockKey(scope: {
  tenantId: string;
  storefrontId: string;
  branchId: string;
  phone: string;
}): bigint {
  const identity = [
    'nextstock:rc-015:storefront-active-orders:v1',
    scope.tenantId,
    scope.storefrontId,
    scope.branchId,
    normalizeStorefrontPhone(scope.phone),
  ].join('\0');
  return createHash('sha256').update(identity).digest().readBigInt64BE(0);
}
