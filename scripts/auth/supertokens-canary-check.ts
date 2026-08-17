import { authProviderMode } from '../../src/auth/auth-provider-mode';
import { readSuperTokensCanaryPolicy } from '../../src/auth/supertokens-canary-policy';
import { runActivationCheck } from './supertokens-activation-check';

type CheckReport = { command: string; mode: string; ready: boolean; blockers: string[]; pii: false };

export async function runCanaryCheck(env: NodeJS.ProcessEnv = process.env): Promise<CheckReport> {
  const blockers: string[] = [];
  let mode = 'invalid';
  try { mode = authProviderMode(env); } catch { blockers.push('AUTH_CONFIGURATION_INVALID'); }
  try { readSuperTokensCanaryPolicy(env); } catch { blockers.push('AUTH_CANARY_CONFIGURATION_INVALID'); }
  const activation = await runActivationCheck(env);
  blockers.push(...activation.blockers);
  if (mode === 'supertokens_only') blockers.push('SUPERTOKENS_ONLY_BLOCKED');
  if (env.AUTH_CANARY_ENABLED === 'true' && env.AUTH_CANARY_ALLOWLIST?.trim() === '' && Number(env.AUTH_CANARY_PERCENTAGE || 0) === 0) blockers.push('AUTH_CANARY_SELECTOR_EMPTY');
  return { command: 'auth:supertokens:canary-check', mode, ready: blockers.length === 0, blockers: [...new Set(blockers)].sort(), pii: false };
}

if (process.argv.some((arg) => arg === 'supertokens-canary-check.js' || arg === 'supertokens-canary-check.ts')) {
  runCanaryCheck().then((report) => { console.log(JSON.stringify(report)); process.exitCode = report.ready ? 0 : 1; });
}

