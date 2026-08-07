import type { DecommissionScope, DecommissionTarget } from './readiness';

export type DecommissionConfig = {
  scope: DecommissionScope;
  target: DecommissionTarget;
  dryRun: boolean;
  databaseUrl?: string;
  providerReady: boolean;
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): DecommissionConfig {
  const scope = (env.DECOMMISSION_SCOPE || 'all') as DecommissionScope;
  const target = (env.DECOMMISSION_TARGET ||
    'coexistence') as DecommissionTarget;
  if (!['auth', 'storage', 'all'].includes(scope))
    throw new Error('DECOMMISSION_SCOPE_INVALID');
  if (!['coexistence', 'supertokens-only', 'gcs-only'].includes(target))
    throw new Error('DECOMMISSION_TARGET_INVALID');
  return {
    scope,
    target,
    dryRun: env.DECOMMISSION_DRY_RUN !== 'false',
    databaseUrl: env.DECOMMISSION_DATABASE_URL,
    providerReady: env.DECOMMISSION_PROVIDER_READY === 'true',
  };
}
