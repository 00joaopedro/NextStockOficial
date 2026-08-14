export type SuperTokensGateInput = {
  unlinkedSupabase: number;
  reconciliationRequired: number;
  duplicateCanonicalEmails: number;
  unresolvedPasswordStrategies: number;
  legacySessionsOutsideWindow: number;
  recoveryValidated: boolean;
  coreConfigured: boolean;
  observabilityReady: boolean;
};

export function evaluateSuperTokensGates(input: SuperTokensGateInput) {
  const blockers: string[] = [];
  if (input.unlinkedSupabase > 0) blockers.push('AUTH_IDENTITIES_UNLINKED');
  if (input.reconciliationRequired > 0) blockers.push('AUTH_RECONCILIATION_REQUIRED');
  if (input.duplicateCanonicalEmails > 0) blockers.push('AUTH_CANONICAL_EMAIL_DUPLICATE');
  if (input.unresolvedPasswordStrategies > 0) blockers.push('AUTH_PASSWORD_STRATEGY_UNRESOLVED');
  if (input.legacySessionsOutsideWindow > 0) blockers.push('AUTH_LEGACY_SESSIONS_OUTSIDE_WINDOW');
  if (!input.recoveryValidated) blockers.push('AUTH_RECOVERY_NOT_VALIDATED');
  if (!input.coreConfigured) blockers.push('SUPERTOKENS_CORE_NOT_CONFIGURED');
  if (!input.observabilityReady) blockers.push('AUTH_OBSERVABILITY_NOT_READY');
  return { ready: blockers.length === 0, blockers };
}
