export type AuthProviderMode = 'supabase_only' | 'coexistence';

export function authProviderMode(env: NodeJS.ProcessEnv = process.env): AuthProviderMode {
  const value = env.AUTH_PROVIDER_MODE?.trim() || 'supabase_only';
  if (value !== 'supabase_only' && value !== 'coexistence') throw new Error('AUTH_PROVIDER_MODE must be supabase_only or coexistence');
  if (value === 'coexistence' && ['SUPERTOKENS_CONNECTION_URI', 'SUPERTOKENS_APP_NAME', 'SUPERTOKENS_API_DOMAIN'].some((name) => !env[name]?.trim())) throw new Error('SuperTokens coexistence configuration is incomplete');
  if (value === 'coexistence' && env.APP_ENV === 'production' && !env.SUPERTOKENS_API_KEY?.trim()) throw new Error('SuperTokens production configuration requires SUPERTOKENS_API_KEY');
  return value;
}
