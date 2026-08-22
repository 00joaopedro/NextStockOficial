import { createHash } from 'crypto';

export const STOREFRONT_ACTIVE_ORDER_LIMIT = 3;
export const STOREFRONT_ACTIVE_ORDER_WINDOW_DAYS = 30;
export const STOREFRONT_PHONE_MIN_DIGITS = 8;
export const STOREFRONT_PHONE_MAX_DIGITS = 20;

/** Canonical representation accepted by the public checkout DTO. */
export function normalizeStorefrontPhone(value: string): string {
  if (!/^\+?[0-9 ()-]+$/.test(value))
    throw new Error('STOREFRONT_PHONE_INVALID_CHARACTERS');
  const canonical = value.replace(/\D/g, '');
  if (
    canonical.length < STOREFRONT_PHONE_MIN_DIGITS ||
    canonical.length > STOREFRONT_PHONE_MAX_DIGITS
  )
    throw new Error('STOREFRONT_PHONE_INVALID_LENGTH');
  return canonical;
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
