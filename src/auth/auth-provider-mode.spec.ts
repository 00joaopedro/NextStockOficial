import { authProviderMode } from './auth-provider-mode';

describe('auth provider mode', () => {
  it('defaults to Supabase-only and requires coexistence configuration', () => {
    expect(authProviderMode({})).toBe('supabase_only');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'coexistence' })).toThrow('incomplete');
    const configured = {
      SUPERTOKENS_CONNECTION_URI: 'http://core.test',
      SUPERTOKENS_APP_NAME: 'test',
      SUPERTOKENS_API_DOMAIN: 'http://api.test',
      SUPERTOKENS_WEBSITE_DOMAIN: 'http://web.test',
    };
    expect(authProviderMode({ AUTH_PROVIDER_MODE: 'coexistence', ...configured })).toBe('coexistence');
    expect(authProviderMode({ AUTH_PROVIDER_MODE: 'supertokens_primary', ...configured })).toBe('supertokens_primary');
    expect(authProviderMode({ AUTH_PROVIDER_MODE: 'supertokens_only', AUTH_MIGRATION_ENABLED: 'true', ...configured })).toBe('supertokens_only');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'supertokens_only', ...configured })).toThrow('AUTH_MIGRATION_ENABLED');
  });
});
