import { runCanaryCheck } from './supertokens-canary-check';

export async function runCutoverCheck(env: NodeJS.ProcessEnv = process.env) {
  const base = await runCanaryCheck(env);
  const blockers = [...base.blockers];
  for (const [name, code] of [
    ['AUTH_PREFLIGHT_UNLINKED', 'AUTH_IDENTITIES_UNLINKED'],
    ['AUTH_PREFLIGHT_RECONCILIATION', 'AUTH_RECONCILIATION_REQUIRED'],
    ['AUTH_PREFLIGHT_PASSWORD_STRATEGIES', 'AUTH_PASSWORD_STRATEGY_UNRESOLVED'],
    ['AUTH_PREFLIGHT_LEGACY_SESSIONS', 'AUTH_LEGACY_SESSIONS_OUTSIDE_WINDOW'],
  ] as const) if (Number(env[name] || 0) > 0) blockers.push(code);
  blockers.push('SUPERTOKENS_ONLY_BLOCKED');
  return { command: 'auth:supertokens:cutover-check', mode: base.mode, ready: false, blockers: [...new Set(blockers)].sort(), pii: false as const };
}

if (process.argv.some((arg) => arg === 'supertokens-cutover-check.js' || arg === 'supertokens-cutover-check.ts')) {
  runCutoverCheck().then((report) => { console.log(JSON.stringify(report)); process.exitCode = 1; });
}

