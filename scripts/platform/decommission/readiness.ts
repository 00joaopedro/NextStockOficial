import { createHash } from 'node:crypto';

export type DecommissionScope = 'auth' | 'storage' | 'all';
export type DecommissionTarget =
  | 'coexistence'
  | 'supertokens-only'
  | 'gcs-only';

export type GateResult = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  summary: Record<string, number>;
};

export type AuthInventory = {
  profiles: number;
  supabaseIdentities: number;
  supertokensIdentities: number;
  migratedLinked: number;
  canonicalEmailCollisions: number;
  missingCanonicalEmail: number;
  activeLegacySessions: number;
  recoveryReady: number;
  compensationRequired: number;
};

export type StorageInventory = {
  total: number;
  verifiedGcs: number;
  supabaseOnly: number;
  copyPending: number;
  processing: number;
  failedFinal: number;
  hashMismatch: number;
  sizeMismatch: number;
  missingTarget: number;
  invalidTenantPath: number;
  reservationPending: number;
};

export function evaluateAuth(
  inventory: AuthInventory,
  providerReady: boolean,
): GateResult {
  const blockers: string[] = [];
  if (inventory.canonicalEmailCollisions > 0)
    blockers.push('AUTH_CANONICAL_EMAIL_COLLISION');
  if (inventory.missingCanonicalEmail > 0)
    blockers.push('AUTH_MISSING_CANONICAL_EMAIL');
  if (inventory.compensationRequired > 0)
    blockers.push('AUTH_COMPENSATION_REQUIRED');
  if (inventory.activeLegacySessions > 0)
    blockers.push('AUTH_LEGACY_SESSIONS_PENDING');
  if (inventory.recoveryReady < inventory.profiles)
    blockers.push('AUTH_RECOVERY_NOT_READY');
  if (!providerReady) blockers.push('AUTH_PROVIDER_NOT_READY');
  if (inventory.migratedLinked < inventory.profiles)
    blockers.push('AUTH_IDENTITY_MIGRATION_INCOMPLETE');
  return {
    ready: blockers.length === 0,
    blockers,
    warnings: [],
    summary: { ...inventory },
  };
}

export function evaluateStorage(
  inventory: StorageInventory,
  providerReady: boolean,
): GateResult {
  const blockers: string[] = [];
  if (!providerReady) blockers.push('STORAGE_PROVIDER_NOT_READY');
  if (inventory.supabaseOnly > 0)
    blockers.push('STORAGE_OBJECT_MIGRATION_INCOMPLETE');
  if (inventory.copyPending > 0 || inventory.processing > 0)
    blockers.push('STORAGE_COPY_IN_PROGRESS');
  if (inventory.failedFinal > 0) blockers.push('STORAGE_COPY_FAILED_FINAL');
  if (inventory.hashMismatch > 0) blockers.push('STORAGE_HASH_MISMATCH');
  if (inventory.sizeMismatch > 0) blockers.push('STORAGE_SIZE_MISMATCH');
  if (inventory.missingTarget > 0) blockers.push('STORAGE_MISSING_TARGET');
  if (inventory.invalidTenantPath > 0)
    blockers.push('STORAGE_INVALID_TENANT_PATH');
  if (inventory.reservationPending > 0)
    blockers.push('STORAGE_RESERVATION_PENDING');
  return {
    ready: blockers.length === 0,
    blockers,
    warnings: [],
    summary: { ...inventory },
  };
}

export function reportHash(report: unknown): string {
  return createHash('sha256').update(JSON.stringify(report)).digest('hex');
}
