export type LocalOnlyEvidenceSource = 'synthetic' | 'staging' | 'production' | 'unknown';
export type LocalOnlyStatus = 'READY' | 'NOT_READY' | 'UNKNOWN';

export type LocalOnlyReadiness = {
  status: LocalOnlyStatus;
  mode: string;
  environment: string;
  evidenceSource: LocalOnlyEvidenceSource;
  blockers: string[];
  warnings: string[];
  schemaVersion: string;
  pii: false;
};

const evidence = [
  'AUTH_PREFLIGHT_DATABASE_READY',
  'AUTH_PREFLIGHT_RECOVERY_VALIDATED',
  'AUTH_PREFLIGHT_OBSERVABILITY_READY',
  'AUTH_PREFLIGHT_ROLLBACK_READY',
  'AUTH_LOCAL_ONLY_DRY_RUN',
] as const;

export function evaluateLocalOnlyReadiness(
  env: NodeJS.ProcessEnv = process.env,
): LocalOnlyReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = parseSource(env.AUTH_LOCAL_ONLY_EVIDENCE_SOURCE);
  const missingEvidence = evidence.some((name) => env[name] !== 'true');
  if (missingEvidence) blockers.push('REQUIRED_EVIDENCE_MISSING');
  if (env.AUTH_PROVIDER_MODE !== 'local_only') blockers.push('LOCAL_ONLY_NOT_SELECTED');
  if (env.AUTH_LOCAL_ONLY_CONFIRMATION !== 'true') blockers.push('EXPLICIT_LOCAL_ONLY_CONFIRMATION_REQUIRED');
  if (env.AUTH_MIGRATION_ENABLED !== 'true') blockers.push('AUTH_MIGRATION_NOT_ENABLED');
  // These are current startup contracts; do not let a dry-run approve a mode
  // which validateEnvironment/AuthModule would reject.
  if (env.AUTH_MIGRATION_ENABLED === 'true') blockers.push('AUTH_MIGRATION_MODE_INCOMPATIBLE_WITH_STARTUP');
  blockers.push('LOCAL_AUTH_RUNTIME_PROVIDER_UNAVAILABLE');
  if (env.AUTH_LEGACY_FALLBACK_ENABLED === 'true') blockers.push('LEGACY_FALLBACK_MUST_BE_DISABLED');
  if (!env.LOCAL_AUTH_JWT_ACTIVE_KEY?.trim() || !env.LOCAL_AUTH_JWT_KID?.trim()) blockers.push('LOCAL_JWT_NOT_CONFIGURED');
  if (env.AUTH_PREFLIGHT_CONFLICTS === undefined) blockers.push('AUTH_CONFLICT_EVIDENCE_UNKNOWN');
  else if (env.AUTH_PREFLIGHT_CONFLICTS !== '0') blockers.push('AUTH_CONFLICTS_PRESENT');
  if (env.AUTH_PREFLIGHT_AMBIGUOUS === undefined) blockers.push('AUTH_AMBIGUOUS_EVIDENCE_UNKNOWN');
  else if (env.AUTH_PREFLIGHT_AMBIGUOUS !== '0') blockers.push('AUTH_AMBIGUOUS_IDENTITIES_PRESENT');
  if (env.AUTH_PREFLIGHT_UNKNOWN_STATES === undefined) blockers.push('AUTH_UNKNOWN_STATE_EVIDENCE_UNKNOWN');
  else if (env.AUTH_PREFLIGHT_UNKNOWN_STATES !== '0') blockers.push('AUTH_UNKNOWN_STATES_PRESENT');
  if (env.AUTH_LOCAL_PRIMARY_OBSERVED !== 'true') blockers.push('LOCAL_PRIMARY_OBSERVATION_REQUIRED');
  if (source === 'unknown') blockers.push('EVIDENCE_SOURCE_UNKNOWN');
  if (source === 'synthetic') warnings.push('SYNTHETIC_EVIDENCE_NOT_PRODUCTION_PROOF');
  if (source === 'production') blockers.push('PRODUCTION_EVIDENCE_NOT_ALLOWED_FOR_LOCAL_PREPARATION');
  return {
    status: blockers.length ? (missingEvidence || source === 'unknown' ? 'UNKNOWN' : 'NOT_READY') : 'READY',
    mode: env.AUTH_PROVIDER_MODE || 'supabase_only',
    environment: env.APP_ENV || env.NODE_ENV || 'unknown',
    evidenceSource: source,
    blockers: [...new Set(blockers)].sort(),
    warnings,
    schemaVersion: 'local-only-readiness-v1',
    pii: false,
  };
}

function parseSource(value: string | undefined): LocalOnlyEvidenceSource {
  if (value === 'synthetic' || value === 'staging' || value === 'production') return value;
  return 'unknown';
}
