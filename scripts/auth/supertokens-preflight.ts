import { authProviderMode } from '../../src/auth/auth-provider-mode';
import { evaluateSuperTokensGates } from './supertokens-readiness';

export type PreflightResult = { ready: boolean; mode: string; blockers: string[]; pii: false };

export function runPreflight(env: NodeJS.ProcessEnv = process.env): PreflightResult {
  const mode = authProviderMode(env);
  const coreConfigured = mode === 'supabase_only' || Boolean(env.SUPERTOKENS_CONNECTION_URI && env.SUPERTOKENS_API_KEY);
  const gates = evaluateSuperTokensGates({
    unlinkedSupabase: Number(env.AUTH_PREFLIGHT_UNLINKED || 0),
    reconciliationRequired: Number(env.AUTH_PREFLIGHT_RECONCILIATION || 0),
    duplicateCanonicalEmails: Number(env.AUTH_PREFLIGHT_DUPLICATE_EMAILS || 0),
    unresolvedPasswordStrategies: Number(env.AUTH_PREFLIGHT_PASSWORD_STRATEGIES || 0),
    legacySessionsOutsideWindow: Number(env.AUTH_PREFLIGHT_LEGACY_SESSIONS || 0),
    recoveryValidated: env.AUTH_PREFLIGHT_RECOVERY_VALIDATED === 'true' || mode === 'supabase_only',
    coreConfigured,
    observabilityReady: env.AUTH_PREFLIGHT_OBSERVABILITY_READY === 'true' || mode === 'supabase_only',
  });
  const blockers = [...gates.blockers];
  if (env.AUTH_PREFLIGHT_FALLBACK_CONFIGURED === 'false') blockers.push('AUTH_FALLBACK_NOT_CONFIGURED');
  if (env.AUTH_PREFLIGHT_ROLLBACK_READY === 'false') blockers.push('AUTH_ROLLBACK_NOT_READY');
  return { ready: gates.ready && blockers.length === 0, mode, blockers, pii: false };
}

if (process.argv[1]?.endsWith('supertokens-preflight.ts')) {
  try {
    const result = runPreflight();
    console.log(process.argv.includes('--json') ? JSON.stringify(result) : `mode=${result.mode}\nready=${result.ready}\n${result.blockers.map((b) => `blocker=${b}`).join('\n')}`);
    process.exitCode = result.ready ? 0 : 1;
  } catch {
    console.error(process.argv.includes('--json') ? JSON.stringify({ ready: false, blockers: ['INVALID_CONFIGURATION'], pii: false }) : 'preflight=blocked\nblocker=INVALID_CONFIGURATION');
    process.exitCode = 1;
  }
}
