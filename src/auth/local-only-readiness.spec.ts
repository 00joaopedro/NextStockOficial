import { evaluateLocalOnlyReadiness } from './local-only-readiness';

describe('local_only readiness', () => {
  const complete = {
    AUTH_PROVIDER_MODE: 'local_only',
    AUTH_LOCAL_ONLY_CONFIRMATION: 'true',
    AUTH_MIGRATION_ENABLED: 'true',
    AUTH_LEGACY_FALLBACK_ENABLED: 'false',
    LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(32),
    LOCAL_AUTH_JWT_KID: 'active',
    AUTH_PREFLIGHT_DATABASE_READY: 'true',
    AUTH_PREFLIGHT_RECOVERY_VALIDATED: 'true',
    AUTH_PREFLIGHT_OBSERVABILITY_READY: 'true',
    AUTH_PREFLIGHT_ROLLBACK_READY: 'true',
    AUTH_LOCAL_ONLY_DRY_RUN: 'true',
    AUTH_PREFLIGHT_CONFLICTS: '0',
    AUTH_PREFLIGHT_AMBIGUOUS: '0',
    AUTH_PREFLIGHT_UNKNOWN_STATES: '0',
    AUTH_LOCAL_PRIMARY_OBSERVED: 'true',
    AUTH_LOCAL_ONLY_EVIDENCE_SOURCE: 'synthetic',
  };

  it('defaults unknown and never treats missing evidence as zero', () => {
    const report = evaluateLocalOnlyReadiness({});
    expect(report.status).toBe('UNKNOWN');
    expect(report.blockers).toContain('REQUIRED_EVIDENCE_MISSING');
    expect(report.evidenceSource).toBe('unknown');
  });

  it('does not report ready for the current rejected startup contract', () => {
    const report = evaluateLocalOnlyReadiness(complete);
    expect(report.status).toBe('NOT_READY');
    expect(report.blockers).toContain(
      'AUTH_MIGRATION_MODE_INCOMPATIBLE_WITH_STARTUP',
    );
    expect(report.blockers).toContain(
      'LOCAL_AUTH_RUNTIME_PROVIDER_UNAVAILABLE',
    );
  });

  it('requires disabled fallback and observed local_primary', () => {
    expect(
      evaluateLocalOnlyReadiness({
        ...complete,
        AUTH_LEGACY_FALLBACK_ENABLED: 'true',
      }).blockers,
    ).toContain('LEGACY_FALLBACK_MUST_BE_DISABLED');
    expect(
      evaluateLocalOnlyReadiness({
        ...complete,
        AUTH_LOCAL_PRIMARY_OBSERVED: 'false',
      }).blockers,
    ).toContain('LOCAL_PRIMARY_OBSERVATION_REQUIRED');
    expect(
      evaluateLocalOnlyReadiness({
        ...complete,
        AUTH_LEGACY_FALLBACK_ENABLED: undefined,
      }).blockers,
    ).toContain('LEGACY_FALLBACK_MUST_BE_DISABLED');
    expect(
      evaluateLocalOnlyReadiness({
        ...complete,
        AUTH_LEGACY_FALLBACK_ENABLED: 'false',
      }).blockers,
    ).not.toContain('LEGACY_FALLBACK_MUST_BE_DISABLED');
  });

  it.each([
    { LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(31) },
    { LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(32), LOCAL_AUTH_JWT_KID: '' },
    {
      LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(32),
      LOCAL_AUTH_JWT_KID: 'active',
      LOCAL_AUTH_JWT_PREVIOUS_KEY: 'y'.repeat(32),
    },
    {
      LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(32),
      LOCAL_AUTH_JWT_KID: 'active',
      LOCAL_AUTH_JWT_PREVIOUS_KID: 'previous',
    },
    {
      LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(32),
      LOCAL_AUTH_JWT_KID: 'active',
      LOCAL_AUTH_JWT_PREVIOUS_KEY: 'short',
      LOCAL_AUTH_JWT_PREVIOUS_KID: 'previous',
    },
  ])('blocks JWT configuration rejected by runtime: %j', (jwt) => {
    const report = evaluateLocalOnlyReadiness({ ...complete, ...jwt });
    expect(report.blockers).toContain('LOCAL_JWT_CONFIGURATION_INVALID');
    expect(JSON.stringify(report)).not.toContain('xxxxxxxx');
  });

  it('accepts the same complete JWT invariants as the runtime validator', () => {
    const report = evaluateLocalOnlyReadiness({
      ...complete,
      LOCAL_AUTH_JWT_PREVIOUS_KEY: 'y'.repeat(32),
      LOCAL_AUTH_JWT_PREVIOUS_KID: 'previous',
    });
    expect(report.blockers).not.toContain('LOCAL_JWT_CONFIGURATION_INVALID');
  });

  it('labels synthetic evidence and never exposes secrets or PII', () => {
    const report = evaluateLocalOnlyReadiness(complete);
    expect(report).toMatchObject({ evidenceSource: 'synthetic', pii: false });
    expect(JSON.stringify(report)).not.toContain('xxxxxxxx');
    expect(JSON.stringify(report)).not.toContain('@');
  });
});
