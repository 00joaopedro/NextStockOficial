import {
  evaluateLocalPrimaryReadiness,
  localPrimaryCanaryDecision,
} from './local-primary-readiness';

describe('local primary readiness and canary', () => {
  const ready = {
    AUTH_PROVIDER_MODE: 'local_primary', AUTH_MIGRATION_ENABLED: 'true',
    AUTH_LOCAL_PRIMARY_CONFIRMATION: 'true', LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(32),
    LOCAL_AUTH_JWT_KID: 'active', AUTH_PREFLIGHT_DATABASE_READY: 'true',
    AUTH_PREFLIGHT_RECOVERY_VALIDATED: 'true', AUTH_PREFLIGHT_OBSERVABILITY_READY: 'true',
    AUTH_PREFLIGHT_FALLBACK_CONFIGURED: 'true', AUTH_PREFLIGHT_ROLLBACK_READY: 'true',
    AUTH_PREFLIGHT_CONFLICTS: '0', AUTH_PREFLIGHT_AMBIGUOUS: '0',
    AUTH_PREFLIGHT_SOURCE_PROVIDER: 'supabase', AUTH_LEGACY_FALLBACK_ENABLED: 'true',
  };

  it('defaults to unknown when evidence is absent', () => {
    expect(evaluateLocalPrimaryReadiness({}).status).toBe('UNKNOWN');
    expect(evaluateLocalPrimaryReadiness({}).blockers).toContain('REQUIRED_EVIDENCE_MISSING');
  });
  it('requires explicit confirmation and is ready only with complete evidence', () => {
    expect(evaluateLocalPrimaryReadiness(ready)).toMatchObject({ status: 'READY', pii: false });
    expect(evaluateLocalPrimaryReadiness({ ...ready, AUTH_LOCAL_PRIMARY_CONFIRMATION: 'false' }).status).toBe('NOT_READY');
  });
  it('is deterministic, denylist-first, and rejects invalid configuration', () => {
    const args = ['synthetic-profile', 50, 's'.repeat(32), new Set(['synthetic-profile']), new Set(['synthetic-profile'])] as const;
    expect(localPrimaryCanaryDecision(...args)).toBe(false);
    expect(localPrimaryCanaryDecision(...args)).toBe(false);
    expect(() => localPrimaryCanaryDecision('x', 101, 's'.repeat(32))).toThrow();
    expect(() => localPrimaryCanaryDecision('x', 1, 'short')).toThrow();
  });
});
