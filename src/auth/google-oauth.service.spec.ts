import { GoogleOAuthService } from './google-oauth.service';

describe('GoogleOAuthService', () => {
  it('gera URL OAuth com seletor oficial de conta e state PKCE', async () => {
    const service = new GoogleOAuthService(
      { oAuthIntent: { create: jest.fn().mockResolvedValue({}) } } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const envKeys = [
      'GOOGLE_OAUTH_ENABLED',
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_OAUTH_CALLBACK_URL',
      'LOCAL_AUTH_JWT_ACTIVE_KEY',
      'LOCAL_AUTH_JWT_KID',
    ] as const;
    const previous = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      GOOGLE_OAUTH_ENABLED: 'true',
      GOOGLE_OAUTH_CLIENT_ID: 'staging-client',
      GOOGLE_OAUTH_CLIENT_SECRET: 'staging-secret',
      GOOGLE_OAUTH_CALLBACK_URL:
        'https://nextstockoficial-dominio-teste.up.railway.app/api/auth/google/callback',
      LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(32),
      LOCAL_AUTH_JWT_KID: 'test-key-1',
    });

    try {
      const result = await service.start('login');
      const url = new URL(result);
      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.pathname).toBe('/o/oauth2/v2/auth');
      expect(url.searchParams.get('prompt')).toBe('select_account');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://nextstockoficial-dominio-teste.up.railway.app/api/auth/google/callback',
      );
    } finally {
      envKeys.forEach((key) => {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });
});
