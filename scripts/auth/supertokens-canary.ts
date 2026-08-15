export type CanaryConfig = { enabled: boolean; killSwitch: boolean; limit: number; eligible: string[] };
export function selectCanary(config: CanaryConfig) {
  if (!config.enabled || config.killSwitch || config.limit < 1) return [];
  return config.eligible.slice(0, Math.min(config.limit, 100));
}
export function rollbackAuth(target: 'supabase_only' | 'coexistence') {
  return { target, migrationBlocked: true, preserveAuthIdentity: true, revokeSuperTokensSessions: false, auditRequired: true } as const;
}
