export type AuthProviderMode =
  | 'supabase_only'
  | 'coexistence'
  | 'supertokens_primary'
  | 'supertokens_only';

const MODES: AuthProviderMode[] = [
  'supabase_only',
  'coexistence',
  'supertokens_primary',
  'supertokens_only',
];

export function authProviderMode(env: NodeJS.ProcessEnv = process.env): AuthProviderMode {
  const value = env.AUTH_PROVIDER_MODE?.trim() || 'supabase_only';
  if (!MODES.includes(value as AuthProviderMode)) {
    throw new Error(`AUTH_PROVIDER_MODE must be one of: ${MODES.join(', ')}`);
  }
  if (value !== 'supabase_only' && ['SUPERTOKENS_CONNECTION_URI', 'SUPERTOKENS_APP_NAME', 'SUPERTOKENS_API_DOMAIN', 'SUPERTOKENS_WEBSITE_DOMAIN'].some((name) => !env[name]?.trim())) {
    throw new Error('SuperTokens configuration is incomplete');
  }
  if (value !== 'supabase_only' && env.APP_ENV === 'production' && !env.SUPERTOKENS_API_KEY?.trim()) {
    throw new Error('SuperTokens production configuration requires SUPERTOKENS_API_KEY');
  }
  if (value === 'supertokens_only' && env.AUTH_MIGRATION_ENABLED !== 'true') {
    throw new Error('supertokens_only requires AUTH_MIGRATION_ENABLED=true');
  }
  return value;
}

export function authMigrationEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.AUTH_MIGRATION_ENABLED === 'true';
}

export function legacyFallbackEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.AUTH_LEGACY_FALLBACK_ENABLED !== 'false';
}
