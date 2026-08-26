const AUTH_PROVIDER_MODES = [
  'supabase_only',
  'coexistence',
  'local_primary',
  'local_only',
] as const;

export type AuthProviderMode = (typeof AUTH_PROVIDER_MODES)[number];

function isAuthProviderMode(value: string): value is AuthProviderMode {
  return (AUTH_PROVIDER_MODES as readonly string[]).includes(value);
}

export function authProviderMode(env: NodeJS.ProcessEnv = process.env): AuthProviderMode {
  const value = env.AUTH_PROVIDER_MODE?.trim() || 'supabase_only';
  if (!isAuthProviderMode(value)) {
    throw new Error(`AUTH_PROVIDER_MODE must be one of: ${AUTH_PROVIDER_MODES.join(', ')}`);
  }
  if (env.AUTH_PROVIDER_MODE === 'supertokens_primary' || env.AUTH_PROVIDER_MODE === 'supertokens_only') {
    throw new Error('SuperTokens modes are retired; use supabase_only, coexistence, local_primary or local_only after completing the local-auth gates.');
  }
  if (value !== 'supabase_only' && env.AUTH_MIGRATION_ENABLED !== 'true') {
    throw new Error(`${value} requires AUTH_MIGRATION_ENABLED=true`);
  }
  if (value === 'local_primary' || value === 'local_only') {
    throw new Error(`${value} is blocked until all local-auth rollout gates are satisfied.`);
  }
  return value;
}

export function authMigrationEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.AUTH_MIGRATION_ENABLED === 'true';
}

export function legacyFallbackEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.AUTH_LEGACY_FALLBACK_ENABLED !== 'false';
}
