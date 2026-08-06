import { authProviderMode } from './auth-provider-mode';

describe('auth provider mode', () => {
  it('defaults to Supabase-only and requires coexistence configuration', () => {
    expect(authProviderMode({})).toBe('supabase_only');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'coexistence' })).toThrow('incomplete');
    expect(authProviderMode({ AUTH_PROVIDER_MODE: 'coexistence', SUPERTOKENS_CONNECTION_URI: 'http://core.test', SUPERTOKENS_APP_NAME: 'test', SUPERTOKENS_API_DOMAIN: 'http://api.test' })).toBe('coexistence');
  });
});
