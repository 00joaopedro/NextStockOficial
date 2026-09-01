const AUTH_PROVIDER_MODES = [
  'supabase_only',
  'coexistence',
  'supertokens_primary',
  'supertokens_only',
  'local_primary',
  'local_only',
] as const;
export type AuthProviderMode = (typeof AUTH_PROVIDER_MODES)[number];
function isAuthProviderMode(value: string): value is AuthProviderMode {
  return (AUTH_PROVIDER_MODES as readonly string[]).includes(value);
}
export function authProviderMode(
  env: NodeJS.ProcessEnv = process.env,
): AuthProviderMode {
  const value = env.AUTH_PROVIDER_MODE?.trim() || 'supabase_only';
  if (!isAuthProviderMode(value))
    throw new Error(
      `AUTH_PROVIDER_MODE must be one of: ${AUTH_PROVIDER_MODES.join(', ')}`,
    );
  if (
    (value === 'supertokens_only' ||
      value === 'local_primary' ||
      value === 'local_only') &&
    env.AUTH_MIGRATION_ENABLED !== 'true'
  )
    throw new Error(`${value} requires AUTH_MIGRATION_ENABLED=true`);
  if (
    ['coexistence', 'supertokens_primary', 'supertokens_only'].includes(value)
  ) {
    for (const name of [
      'SUPERTOKENS_CONNECTION_URI',
      'SUPERTOKENS_APP_NAME',
      'SUPERTOKENS_API_DOMAIN',
      'SUPERTOKENS_WEBSITE_DOMAIN',
    ])
      if (!env[name]?.trim())
        throw new Error('SuperTokens configuration is incomplete');
    if (env.APP_ENV === 'production' && !env.SUPERTOKENS_API_KEY?.trim())
      throw new Error(
        'SuperTokens production configuration requires SUPERTOKENS_API_KEY',
      );
  }
  return value;
}
export function authMigrationEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.AUTH_MIGRATION_ENABLED === 'true';
}
export function legacyFallbackEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.AUTH_LEGACY_FALLBACK_ENABLED !== 'false';
}
