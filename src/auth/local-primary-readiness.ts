import { createHmac } from 'node:crypto';

export type LocalPrimaryReadinessStatus = 'READY' | 'NOT_READY' | 'UNKNOWN';

export type LocalPrimaryReadiness = {
  status: LocalPrimaryReadinessStatus;
  blockers: string[];
  warnings: string[];
  schemaVersion: string;
  pii: false;
};

const requiredEvidence = [
  'AUTH_PREFLIGHT_DATABASE_READY',
  'AUTH_PREFLIGHT_RECOVERY_VALIDATED',
  'AUTH_PREFLIGHT_OBSERVABILITY_READY',
  'AUTH_PREFLIGHT_FALLBACK_CONFIGURED',
  'AUTH_PREFLIGHT_ROLLBACK_READY',
] as const;

export function evaluateLocalPrimaryReadiness(
  env: NodeJS.ProcessEnv = process.env,
): LocalPrimaryReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const missing = requiredEvidence.filter((name) => env[name] !== 'true');
  if (missing.length) blockers.push('REQUIRED_EVIDENCE_MISSING');
  if (env.AUTH_PROVIDER_MODE !== 'local_primary')
    blockers.push('LOCAL_PRIMARY_NOT_SELECTED');
  if (env.AUTH_MIGRATION_ENABLED !== 'true')
    blockers.push('AUTH_MIGRATION_NOT_ENABLED');
  if (env.AUTH_LOCAL_PRIMARY_CONFIRMATION !== 'true')
    blockers.push('EXPLICIT_CONFIRMATION_REQUIRED');
  if (!env.LOCAL_AUTH_JWT_ACTIVE_KEY?.trim() || !env.LOCAL_AUTH_JWT_KID?.trim())
    blockers.push('LOCAL_JWT_NOT_CONFIGURED');
  if (env.AUTH_PREFLIGHT_CONFLICTS === undefined)
    blockers.push('AUTH_CONFLICT_EVIDENCE_UNKNOWN');
  else if (env.AUTH_PREFLIGHT_CONFLICTS !== '0')
    blockers.push('AUTH_CONFLICTS_PRESENT');
  if (env.AUTH_PREFLIGHT_AMBIGUOUS === undefined)
    blockers.push('AUTH_AMBIGUOUS_EVIDENCE_UNKNOWN');
  else if (env.AUTH_PREFLIGHT_AMBIGUOUS !== '0')
    blockers.push('AUTH_AMBIGUOUS_IDENTITIES_PRESENT');
  if (env.AUTH_PREFLIGHT_SOURCE_PROVIDER !== 'supabase')
    blockers.push('AUTH_SOURCE_PROVIDER_INVALID');
  if (env.AUTH_LEGACY_FALLBACK_ENABLED !== 'true')
    warnings.push('LEGACY_FALLBACK_DISABLED');
  return {
    status: blockers.length ? (missing.length ? 'UNKNOWN' : 'NOT_READY') : 'READY',
    blockers: [...new Set(blockers)].sort(),
    warnings,
    schemaVersion: 'local-primary-readiness-v1',
    pii: false,
  };
}

export function localPrimaryBucket(subject: string, secret: string): number {
  if (!subject || secret.length < 32) throw new Error('CANARY_SECRET_REQUIRED');
  return createHmac('sha256', secret).update(subject, 'utf8').digest().readUInt32BE(0) % 100;
}

export function localPrimaryCanaryDecision(
  subject: string,
  percentage: number,
  secret: string,
  allowlist: ReadonlySet<string> = new Set(),
  denylist: ReadonlySet<string> = new Set(),
) {
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100)
    throw new Error('CANARY_PERCENTAGE_INVALID');
  if (!subject || denylist.has(subject) || percentage === 0) return false;
  if (allowlist.has(subject)) return true;
  return localPrimaryBucket(subject, secret) < percentage;
}
