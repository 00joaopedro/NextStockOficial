import { authProviderMode } from '../../src/auth/auth-provider-mode';
import { evaluateSuperTokensGates } from './supertokens-readiness';

type ActivationState =
  | 'NOT_CONFIGURED'
  | 'CORE_UNREACHABLE'
  | 'COEXISTENCE_READY'
  | 'PRIMARY_READY'
  | 'ONLY_READY';

export type ActivationReport = {
  state: ActivationState;
  mode: string;
  blockers: string[];
  core: {
    configured: boolean;
    reachable: boolean;
    compatible: boolean;
    recipes: boolean;
  };
  pii: false;
};

const numberEnv = (env: NodeJS.ProcessEnv, name: string) =>
  Number(env[name] || 0);

export async function runActivationCheck(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ActivationReport> {
  let mode: string;
  try {
    mode = authProviderMode(env);
  } catch {
    return {
      state: 'NOT_CONFIGURED',
      mode: 'invalid',
      blockers: ['INVALID_CONFIGURATION'],
      core: {
        configured: false,
        reachable: false,
        compatible: false,
        recipes: false,
      },
      pii: false,
    };
  }
  const configured = Boolean(
    env.SUPERTOKENS_CONNECTION_URI?.trim() && env.SUPERTOKENS_API_KEY?.trim(),
  );
  if (!configured)
    return {
      state: 'NOT_CONFIGURED',
      mode,
      blockers: ['SUPERTOKENS_CORE_NOT_CONFIGURED'],
      core: {
        configured: false,
        reachable: false,
        compatible: false,
        recipes: false,
      },
      pii: false,
    };
  const apiKey = env.SUPERTOKENS_API_KEY as string;
  let reachable = false;
  let compatible = false;
  let recipes = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Number(env.SUPERTOKENS_REQUEST_TIMEOUT_MS || 3000),
    );
    const response = await fetch(
      new URL('/hello', env.SUPERTOKENS_CONNECTION_URI),
      { headers: { 'api-key': apiKey }, signal: controller.signal },
    );
    clearTimeout(timer);
    reachable = response.ok;
    const body = await response.text();
    compatible = response.ok && body.includes('Hello');
    const apiCheck = await fetch(
      new URL('/recipe/user/list', env.SUPERTOKENS_CONNECTION_URI),
      { headers: { 'api-key': apiKey }, signal: controller.signal },
    );
    recipes = apiCheck.ok && env.AUTH_PREFLIGHT_RECIPES_VALIDATED === 'true';
  } catch {
    /* sanitized fail-closed result */
  }
  const gates = evaluateSuperTokensGates({
    unlinkedSupabase: numberEnv(env, 'AUTH_PREFLIGHT_UNLINKED'),
    reconciliationRequired: numberEnv(env, 'AUTH_PREFLIGHT_RECONCILIATION'),
    duplicateCanonicalEmails: numberEnv(env, 'AUTH_PREFLIGHT_DUPLICATE_EMAILS'),
    unresolvedPasswordStrategies: numberEnv(
      env,
      'AUTH_PREFLIGHT_PASSWORD_STRATEGIES',
    ),
    legacySessionsOutsideWindow: numberEnv(
      env,
      'AUTH_PREFLIGHT_LEGACY_SESSIONS',
    ),
    recoveryValidated: env.AUTH_PREFLIGHT_RECOVERY_VALIDATED === 'true',
    coreConfigured: configured && reachable && compatible && recipes,
    observabilityReady: env.AUTH_PREFLIGHT_OBSERVABILITY_READY === 'true',
  });
  const blockers = [...gates.blockers];
  if (env.AUTH_PREFLIGHT_FALLBACK_CONFIGURED !== 'true')
    blockers.push('AUTH_FALLBACK_NOT_CONFIGURED');
  if (env.AUTH_PREFLIGHT_ROLLBACK_READY !== 'true')
    blockers.push('AUTH_ROLLBACK_NOT_READY');
  if (!reachable) blockers.push('SUPERTOKENS_CORE_UNREACHABLE');
  const state: ActivationState = !reachable
    ? 'CORE_UNREACHABLE'
    : !gates.ready || blockers.length
      ? 'COEXISTENCE_READY'
      : mode === 'supertokens_only'
        ? 'ONLY_READY'
        : mode === 'supertokens_primary'
          ? 'PRIMARY_READY'
          : 'COEXISTENCE_READY';
  return {
    state,
    mode,
    blockers: [...new Set(blockers)],
    core: { configured, reachable, compatible, recipes },
    pii: false,
  };
}

if (
  process.argv[1]?.endsWith('supertokens-activation-check.ts') ||
  process.argv[1]?.endsWith('supertokens-activation-check.js')
) {
  runActivationCheck().then((report) => {
    console.log(
      process.argv.includes('--json')
        ? JSON.stringify(report)
        : [
            `state=${report.state}`,
            `mode=${report.mode}`,
            `core_reachable=${report.core.reachable}`,
            ...report.blockers.map((b) => `blocker=${b}`),
          ].join('\n'),
    );
    process.exitCode = report.blockers.length ? 1 : 0;
  });
}
