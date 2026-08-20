import { authProviderMode } from '../../src/auth/auth-provider-mode';
import { evaluateSuperTokensGates } from './supertokens-readiness';

export type PreflightResult = {
  ready: boolean;
  mode: string;
  blockers: string[];
  blockerCodes: string[];
  checks: { core: string; database: string; gates: string };
  pii: false;
};

export function runPreflight(
  env: NodeJS.ProcessEnv = process.env,
): PreflightResult {
  const mode = authProviderMode(env);
  const coreConfigured =
    mode === 'supabase_only' ||
    Boolean(env.SUPERTOKENS_CONNECTION_URI && env.SUPERTOKENS_API_KEY);
  const gates = evaluateSuperTokensGates({
    unlinkedSupabase: Number(env.AUTH_PREFLIGHT_UNLINKED || 0),
    reconciliationRequired: Number(env.AUTH_PREFLIGHT_RECONCILIATION || 0),
    duplicateCanonicalEmails: Number(env.AUTH_PREFLIGHT_DUPLICATE_EMAILS || 0),
    unresolvedPasswordStrategies: Number(
      env.AUTH_PREFLIGHT_PASSWORD_STRATEGIES || 0,
    ),
    legacySessionsOutsideWindow: Number(
      env.AUTH_PREFLIGHT_LEGACY_SESSIONS || 0,
    ),
    recoveryValidated:
      env.AUTH_PREFLIGHT_RECOVERY_VALIDATED === 'true' ||
      mode === 'supabase_only',
    coreConfigured,
    observabilityReady:
      env.AUTH_PREFLIGHT_OBSERVABILITY_READY === 'true' ||
      mode === 'supabase_only',
  });
  const blockers = [...gates.blockers];
  const coreStatus = env.AUTH_PREFLIGHT_CORE_STATUS?.trim();
  if (mode !== 'supabase_only' && coreStatus !== 'healthy') {
    blockers.push(
      coreStatus
        ? `SUPERTOKENS_CORE_${coreStatus.toUpperCase()}`
        : 'SUPERTOKENS_CORE_NOT_VALIDATED',
    );
  }
  if (
    env.AUTH_PREFLIGHT_FALLBACK_CONFIGURED !== 'true' &&
    mode !== 'supabase_only'
  )
    blockers.push('AUTH_FALLBACK_NOT_CONFIGURED');
  if (env.AUTH_PREFLIGHT_ROLLBACK_READY !== 'true' && mode !== 'supabase_only')
    blockers.push('AUTH_ROLLBACK_NOT_READY');
  if (mode !== 'supabase_only' && env.AUTH_PREFLIGHT_DATABASE_READY !== 'true')
    blockers.push('AUTH_PREFLIGHT_DATABASE_UNAVAILABLE');
  const unique = [...new Set(blockers)].sort();
  return {
    ready: gates.ready && unique.length === 0,
    mode,
    blockers: unique,
    blockerCodes: unique,
    checks: {
      core:
        mode === 'supabase_only'
          ? 'not_required'
          : env.AUTH_PREFLIGHT_CORE_STATUS || 'not_checked',
      database:
        mode === 'supabase_only'
          ? 'not_required'
          : env.AUTH_PREFLIGHT_DATABASE_READY === 'true'
            ? 'ok'
            : 'blocked',
      gates: unique.length === 0 ? 'ok' : 'blocked',
    },
    pii: false,
  };
}

if (
  process.argv.some(
    (argument) =>
      argument.endsWith('supertokens-preflight.ts') ||
      argument.endsWith('supertokens-preflight.js'),
  )
) {
  try {
    const result = runPreflight();
    console.log(
      process.argv.includes('--json')
        ? JSON.stringify(result)
        : `mode=${result.mode}\nready=${result.ready}\n${result.blockers.map((b) => `blocker=${b}`).join('\n')}`,
    );
    process.exitCode = result.ready ? 0 : 1;
  } catch {
    console.error(
      process.argv.includes('--json')
        ? JSON.stringify({
            ready: false,
            blockers: ['AUTH_CONFIGURATION_INVALID'],
            blockerCodes: ['AUTH_CONFIGURATION_INVALID'],
            checks: { core: 'invalid', database: 'unknown', gates: 'blocked' },
            pii: false,
          })
        : 'preflight=blocked\nblocker=INVALID_CONFIGURATION',
    );
    process.exitCode = 1;
  }
}
