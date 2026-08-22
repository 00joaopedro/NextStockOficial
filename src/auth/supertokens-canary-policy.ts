import { createHash } from 'node:crypto';

export type CanaryDecision = 'SUPERTOKENS' | 'LEGACY' | 'BLOCKED';

export type CanaryPolicy = {
  enabled: boolean;
  killSwitch: boolean;
  allowlist: ReadonlySet<string>;
  percentage: number;
};

export class CanaryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanaryConfigurationError';
  }
}

export function parseStrictBoolean(
  name: string,
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new CanaryConfigurationError(`${name} must be exactly true or false`);
}

const parsePercentage = (value: string | undefined) => {
  if (value === undefined || value.trim() === '') return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new CanaryConfigurationError(
      'AUTH_CANARY_PERCENTAGE must be an integer from 0 to 100',
    );
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
  const killSwitch = parseStrictBoolean(
    'AUTH_CANARY_KILL_SWITCH',
    env.AUTH_CANARY_KILL_SWITCH,
    false,
  );
  const enabled = parseStrictBoolean(
    'AUTH_CANARY_ENABLED',
    env.AUTH_CANARY_ENABLED,
    false,
  );
  if (killSwitch && enabled)
    throw new CanaryConfigurationError(
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
  if (
    !subject ||
    policy.killSwitch ||
    !policy.enabled ||
    (policy.allowlist.size === 0 && policy.percentage === 0)
  )
    return 'LEGACY';
  if (policy.allowlist.has(subject)) return 'SUPERTOKENS';
  if (policy.percentage === 0) return 'LEGACY';
  const bucket =
    createHash('sha256').update(subject, 'utf8').digest().readUInt32BE(0) % 100;
  return bucket < policy.percentage ? 'SUPERTOKENS' : 'LEGACY';
}
