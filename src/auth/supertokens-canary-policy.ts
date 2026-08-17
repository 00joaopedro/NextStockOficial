import { createHash } from 'node:crypto';

export type CanaryDecision = 'SUPERTOKENS' | 'LEGACY' | 'BLOCKED';

export type CanaryPolicy = {
  enabled: boolean;
  killSwitch: boolean;
  allowlist: ReadonlySet<string>;
  percentage: number;
};

const parsePercentage = (value: string | undefined) => {
  if (value === undefined || value.trim() === '') return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('AUTH_CANARY_PERCENTAGE must be an integer from 0 to 100');
  }
  return parsed;
};

export function readSuperTokensCanaryPolicy(
  env: NodeJS.ProcessEnv = process.env,
): CanaryPolicy {
  const allowlist = new Set(
    (env.AUTH_CANARY_ALLOWLIST || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const killSwitch = env.AUTH_CANARY_KILL_SWITCH === 'true';
  const enabled = env.AUTH_CANARY_ENABLED === 'true';
  if (killSwitch && enabled)
    throw new Error(
      'AUTH_CANARY_KILL_SWITCH conflicts with AUTH_CANARY_ENABLED',
    );
  return {
    enabled,
    killSwitch,
    allowlist,
    percentage: parsePercentage(env.AUTH_CANARY_PERCENTAGE),
  };
}

export function decideSuperTokensCanary(
  subject: string,
  policy: CanaryPolicy,
): CanaryDecision {
  if (!subject || policy.killSwitch || !policy.enabled) return 'LEGACY';
  if (policy.allowlist.has(subject)) return 'SUPERTOKENS';
  if (policy.percentage === 0) return 'LEGACY';
  const bucket =
    createHash('sha256').update(subject, 'utf8').digest().readUInt32BE(0) % 100;
  return bucket < policy.percentage ? 'SUPERTOKENS' : 'LEGACY';
}
