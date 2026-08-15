import { selectCanary, rollbackAuth } from './supertokens-canary';
import { runPreflight } from './supertokens-preflight';

describe('SuperTokens operational rehearsal', () => {
  it('limits canary and honors kill switch', () => {
    expect(selectCanary({ enabled: true, killSwitch: false, limit: 2, eligible: ['a','b','c'] })).toEqual(['a','b']);
    expect(selectCanary({ enabled: true, killSwitch: true, limit: 2, eligible: ['a'] })).toEqual([]);
  });
  it('rolls back to coexistence without deleting identities', () => expect(rollbackAuth('coexistence')).toMatchObject({ migrationBlocked: true, preserveAuthIdentity: true }));
  it('keeps supertokens_only blocked unless all operational gates pass', () => {
    const result = runPreflight({ AUTH_PROVIDER_MODE: 'supertokens_only', AUTH_MIGRATION_ENABLED: 'true', SUPERTOKENS_CONNECTION_URI: 'http://127.0.0.1:3567', SUPERTOKENS_API_KEY: 'secret', SUPERTOKENS_APP_NAME: 'test', SUPERTOKENS_API_DOMAIN: 'http://127.0.0.1', SUPERTOKENS_WEBSITE_DOMAIN: 'http://127.0.0.1', AUTH_PREFLIGHT_RECOVERY_VALIDATED: 'true', AUTH_PREFLIGHT_OBSERVABILITY_READY: 'true', AUTH_PREFLIGHT_FALLBACK_CONFIGURED: 'true', AUTH_PREFLIGHT_ROLLBACK_READY: 'true' });
    expect(result.ready).toBe(false);
  });
});
