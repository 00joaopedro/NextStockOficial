import { createHash } from 'node:crypto';
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

  it('vincula identidade Google verificada ao perfil existente e emite sessão', async () => {
    const intent = {
      id: 'intent-1',
      nonceHash: 'nonce-hash',
      purpose: 'login',
      redirectTo: '/produtos.html',
    };
    const identity = {
      userProfileId: 'profile-1',
      status: 'active',
      disabledAt: null,
    };
    const prisma = {
      oAuthIntent: {
        findFirst: jest.fn().mockResolvedValue(intent),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      authIdentity: {
        findUnique: jest.fn().mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(identity),
        update: jest.fn().mockResolvedValue({ id: 'identity-1' }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
    } as any;
    const auth = {
      issueSessionForProfile: jest.fn().mockResolvedValue({
        accessToken: 'fixture-access-token',
        user: { id: 'profile-1', tenantId: 'tenant-1' },
      }),
    } as any;
    const service = new GoogleOAuthService(
      prisma,
      auth,
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
      GOOGLE_OAUTH_CLIENT_ID: 'fixture-client',
      GOOGLE_OAUTH_CLIENT_SECRET: 'fixture-secret',
      GOOGLE_OAUTH_CALLBACK_URL: 'https://staging.example.test/api/auth/google/callback',
      LOCAL_AUTH_JWT_ACTIVE_KEY: 'x'.repeat(32),
      LOCAL_AUTH_JWT_KID: 'fixture-key',
    });
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id_token: 'fixture-id-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: 'google-subject-fixture',
          email: 'User@Example.Test',
          email_verified: true,
          aud: 'fixture-client',
          iss: 'https://accounts.google.com',
          nonce: 'fixture-nonce',
        }),
      }) as any;
    intent.nonceHash = createHash('sha256')
      .update('fixture-nonce')
      .digest('hex');
    try {
      const result = await service.callback('fixture-code', 'fixture-state');
      expect(result).toMatchObject({
        kind: 'session',
        redirectTo: '/produtos.html',
      });
      expect(prisma.authIdentity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'GOOGLE',
            providerSubject: 'google-subject-fixture',
            canonicalEmail: 'user@example.test',
          }),
        }),
      );
      expect(auth.issueSessionForProfile).toHaveBeenCalledWith('profile-1');
    } finally {
      global.fetch = originalFetch;
      envKeys.forEach((key) => {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });
});
