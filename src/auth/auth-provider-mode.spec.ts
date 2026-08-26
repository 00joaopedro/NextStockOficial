import { authProviderMode } from './auth-provider-mode';

describe('auth provider mode', () => {
  const configured = {
    SUPERTOKENS_CONNECTION_URI: 'http://core.test',
    SUPERTOKENS_APP_NAME: 'test',
    SUPERTOKENS_API_DOMAIN: 'http://api.test',
    SUPERTOKENS_WEBSITE_DOMAIN: 'http://web.test',
  };

  it('defaults to Supabase-only and never falls back to SuperTokens', () => {
    expect(authProviderMode({})).toBe('supabase_only');
    expect(authProviderMode({ AUTH_PROVIDER_MODE: '' })).toBe('supabase_only');
    expect(authProviderMode({ AUTH_PROVIDER_MODE: '   supabase_only  ' })).toBe('supabase_only');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'coexistence' })).toThrow('AUTH_MIGRATION_ENABLED');
  });

  it('returns all four valid modes with the public union type', () => {
    expect(authProviderMode({ AUTH_PROVIDER_MODE: 'coexistence', AUTH_MIGRATION_ENABLED: 'true', ...configured })).toBe('coexistence');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'supertokens_primary', ...configured })).toThrow('retired');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'supertokens_only', AUTH_MIGRATION_ENABLED: 'true', ...configured })).toThrow('retired');
  });

  it('rejects unknown, differently capitalized, and empty-invalid values safely', () => {
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'local_primary', ...configured })).toThrow('AUTH_MIGRATION_ENABLED');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'SUPERtokens_only', ...configured, AUTH_MIGRATION_ENABLED: 'true' })).toThrow('one of');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'unknown' })).toThrow('one of');
  });
});
