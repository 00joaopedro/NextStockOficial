import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { evaluateAuth, evaluateStorage } from './readiness';

const completeAuth = {
  profiles: 2,
  supabaseIdentities: 2,
  supertokensIdentities: 2,
  migratedLinked: 2,
  canonicalEmailCollisions: 0,
  missingCanonicalEmail: 0,
  activeLegacySessions: 0,
  recoveryReady: 2,
  compensationRequired: 0,
};
const completeStorage = {
  total: 2,
  verifiedGcs: 2,
  supabaseOnly: 0,
  copyPending: 0,
  processing: 0,
  failedFinal: 0,
  hashMismatch: 0,
  sizeMismatch: 0,
  missingTarget: 0,
  invalidTenantPath: 0,
  reservationPending: 0,
};

test('complete inventories allow a configured final provider', () => {
  assert.equal(evaluateAuth(completeAuth, true).ready, true);
  assert.equal(evaluateStorage(completeStorage, true).ready, true);
});
test('auth blockers are fail-closed and sanitized', () => {
  const result = evaluateAuth(
    { ...completeAuth, canonicalEmailCollisions: 1, activeLegacySessions: 1 },
    false,
  );
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'AUTH_CANONICAL_EMAIL_COLLISION',
    'AUTH_LEGACY_SESSIONS_PENDING',
    'AUTH_PROVIDER_NOT_READY',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /@|password|jwt|refresh|secret/i);
});
test('storage integrity blockers prevent gcs-only', () => {
  const result = evaluateStorage(
    { ...completeStorage, supabaseOnly: 1, hashMismatch: 1 },
    true,
  );
  assert.deepEqual(result.blockers, [
    'STORAGE_OBJECT_MIGRATION_INCOMPLETE',
    'STORAGE_HASH_MISMATCH',
  ]);
});
