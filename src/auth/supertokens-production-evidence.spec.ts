import { runPreflight } from '../../scripts/auth/supertokens-preflight';
import { buildInventory } from '../../scripts/auth/supertokens-inventory';
import { reconcileDryRun } from '../../scripts/auth/supertokens-reconcile';
import { readEvidence } from '../../scripts/auth/supertokens-evidence';

const configured = {
  AUTH_PROVIDER_MODE: 'coexistence',
  SUPERTOKENS_CONNECTION_URI: 'http://core.test',
  SUPERTOKENS_APP_NAME: 'test',
  SUPERTOKENS_API_DOMAIN: 'http://api.test',
  SUPERTOKENS_WEBSITE_DOMAIN: 'http://web.test',
  SUPERTOKENS_API_KEY: 'synthetic-key',
  AUTH_PREFLIGHT_FALLBACK_CONFIGURED: 'true',
  AUTH_PREFLIGHT_ROLLBACK_READY: 'true',
  AUTH_PREFLIGHT_DATABASE_READY: 'true',
  AUTH_PREFLIGHT_RECOVERY_VALIDATED: 'true',
  AUTH_PREFLIGHT_OBSERVABILITY_READY: 'true',
};

describe('SuperTokens production evidence contracts', () => {
  it('does not require Core for supabase_only', () => {
    expect(runPreflight({ AUTH_PROVIDER_MODE: 'supabase_only' }).ready).toBe(
      true,
    );
  });

  it.each([
    undefined,
    'not_checked',
    'unknown',
    'unavailable',
    'timeout',
    'incompatible',
  ])('blocks an unvalidated Core: %s', (status) => {
    const result = runPreflight({
      ...configured,
      AUTH_PREFLIGHT_CORE_STATUS: status,
    });
    expect(result.ready).toBe(false);
    expect(result.blockerCodes).toContain(
      status
        ? `SUPERTOKENS_CORE_${status.toUpperCase()}`
        : 'SUPERTOKENS_CORE_NOT_VALIDATED',
    );
  });

  it('only accepts an explicitly healthy Core', () => {
    const result = runPreflight({
      ...configured,
      AUTH_PREFLIGHT_CORE_STATUS: 'healthy',
    });
    expect(result.blockerCodes).toEqual([]);
    expect(result.ready).toBe(true);
  });

  it('does not invent a legacy-session count', () => {
    expect(() => buildInventory([], Number.NaN)).toThrow(
      'LEGACY_SESSION_COUNT_UNPROVEN',
    );
    expect(buildInventory([], 0).legacySessions).toBe(0);
    expect(buildInventory([], 2).legacySessions).toBe(2);
  });

  it('rejects invalid reconciliation counts and accepts explicit zero', () => {
    expect(() => reconcileDryRun(-1)).toThrow('RECONCILIATION_SOURCE_INVALID');
    expect(() => reconcileDryRun(1.5)).toThrow('RECONCILIATION_SOURCE_INVALID');
    expect(reconcileDryRun(0)).toMatchObject({
      pending: 0,
      mutations: 0,
      blockerCodes: [],
    });
    expect(reconcileDryRun(2).blockerCodes).toEqual([
      'AUTH_RECONCILIATION_REQUIRED',
    ]);
  });

  it('requires a versioned evidence source', async () => {
    await expect(readEvidence('')).rejects.toThrow('INVENTORY_SOURCE_REQUIRED');
  });
});
