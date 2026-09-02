import { authProviderMode } from './auth-provider-mode';

describe('auth provider mode', () => {
  const configured = {
    SUPERTOKENS_CONNECTION_URI: 'http://core.test',
    SUPERTOKENS_APP_NAME: 'test',
    SUPERTOKENS_API_DOMAIN: 'http://api.test',
    SUPERTOKENS_WEBSITE_DOMAIN: 'http://web.test',
  };
  it('defaults to Supabase-only', () => {
    expect(authProviderMode({})).toBe('supabase_only');
    expect(authProviderMode({ AUTH_PROVIDER_MODE: '' })).toBe('supabase_only');
  });
  it('accepts configured SuperTokens modes and coexistence', () => {
    expect(
      authProviderMode({ AUTH_PROVIDER_MODE: 'coexistence', ...configured }),
    ).toBe('coexistence');
    expect(
      authProviderMode({
        AUTH_PROVIDER_MODE: 'supertokens_primary',
        ...configured,
      }),
    ).toBe('supertokens_primary');
    expect(
      authProviderMode({
        AUTH_PROVIDER_MODE: 'supertokens_only',
        AUTH_MIGRATION_ENABLED: 'true',
        ...configured,
      }),
    ).toBe('supertokens_only');
  });
  it('fails closed for incomplete or unknown configuration', () => {
    expect(() =>
      authProviderMode({ AUTH_PROVIDER_MODE: 'coexistence' }),
    ).toThrow('incomplete');
    expect(() => authProviderMode({ AUTH_PROVIDER_MODE: 'unknown' })).toThrow(
      'one of',
    );
    expect(() =>
      authProviderMode({
        AUTH_PROVIDER_MODE: 'SUPERtokens_only',
        ...configured,
        AUTH_MIGRATION_ENABLED: 'true',
      }),
    ).toThrow('one of');
  });
});
