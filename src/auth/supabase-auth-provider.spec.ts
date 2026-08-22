import { SupabaseAuthProvider } from './supabase-auth-provider';
import { AuthProviderError } from './auth-provider';

describe('SupabaseAuthProvider', () => {
  it('normalizes duplicate email without leaking the provider message', async () => {
    const supabase = {
      admin: {
        auth: {
          admin: {
            createUser: jest.fn().mockResolvedValue({
              data: {},
              error: { message: 'User already registered: secret detail' },
            }),
          },
        },
      },
    };
    const provider = new SupabaseAuthProvider(supabase as any);
    await expect(
      provider.createUser({ email: 'a@example.com', password: 'secret' }),
    ).rejects.toEqual(new AuthProviderError('email_already_exists'));
  });
  it('keeps the HTTP-facing login token result provider-neutral', async () => {
    const supabase = {
      anon: {
        auth: {
          signInWithPassword: jest.fn().mockResolvedValue({
            data: {
              user: { id: 'u', email: 'a@example.com', user_metadata: {} },
              session: { access_token: 'token', refresh_token: 'refresh' },
            },
            error: null,
          }),
        },
      },
    };
    await expect(
      new SupabaseAuthProvider(supabase as any).login({
        email: 'a@example.com',
        password: 'p',
      }),
    ).resolves.toEqual({
      accessToken: 'token',
      refreshToken: 'refresh',
      identity: { id: 'u', email: 'a@example.com', metadata: {} },
    });
  });
});
