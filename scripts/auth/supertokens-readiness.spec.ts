import { evaluateSuperTokensGates } from './supertokens-readiness';

describe('SuperTokens cutover gates', () => {
  const ready = {
    unlinkedSupabase: 0,
    reconciliationRequired: 0,
    duplicateCanonicalEmails: 0,
    unresolvedPasswordStrategies: 0,
    legacySessionsOutsideWindow: 0,
    recoveryValidated: true,
    coreConfigured: true,
    observabilityReady: true,
  };
  it('blocks supertokens_only until every gate is satisfied', () => {
    expect(evaluateSuperTokensGates({ ...ready, unlinkedSupabase: 1 })).toEqual(
      {
        ready: false,
        blockers: ['AUTH_IDENTITIES_UNLINKED'],
      },
    );
  });
  it('approves a completely migrated fixture', () => {
    expect(evaluateSuperTokensGates(ready)).toEqual({
      ready: true,
      blockers: [],
    });
  });
});
