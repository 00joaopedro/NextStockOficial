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

  it('updates the password only after establishing the supplied recovery session', async () => {
    const setSession = jest.fn().mockResolvedValue({
      data: {
        user: { id: 'u', email: 'a@example.com', user_metadata: {} },
        session: { access_token: 'access', refresh_token: 'refresh' },
      },
      error: null,
    });
    const updateUser = jest.fn().mockResolvedValue({
      data: { user: { id: 'u', email: 'a@example.com', user_metadata: {} } },
      error: null,
    });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: () => ({
        auth: { setSession, updateUser, signOut },
      }),
      anon: { auth: { setSession, updateUser, signOut } },
    } as any);

    await expect(
      provider.completePasswordRecovery({
        accessToken: 'access',
        refreshToken: 'refresh',
        newPassword: 'new-password',
      }),
    ).resolves.toEqual({
      id: 'u',
      email: 'a@example.com',
      metadata: {},
      recoverySessionRevoked: true,
    });
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-password' });
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('does not update a password when the recovery session is invalid', async () => {
    const updateUser = jest.fn();
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: () => ({
        auth: {
          setSession: jest.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'invalid or expired token' },
          }),
          updateUser,
        },
      }),
      anon: {
        auth: {
          setSession: jest.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'invalid or expired token' },
          }),
          updateUser,
        },
      },
    } as any);

    await expect(
      provider.completePasswordRecovery({
        accessToken: 'expired',
        refreshToken: 'expired',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({
      code: 'invalid_credentials',
      diagnosticCode: 'RECOVERY_SET_SESSION_INVALID',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('isolates concurrent recovery sessions by request client', async () => {
    const clients = [
      { id: 'a', email: 'a@example.com' },
      { id: 'b', email: 'b@example.com' },
    ];
    const used: string[] = [];
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: jest.fn(() => {
        const user = clients[used.length];
        used.push(user.id);
        return {
          auth: {
            setSession: jest.fn().mockResolvedValue({
              data: { user, session: {} },
              error: null,
            }),
            updateUser: jest
              .fn()
              .mockImplementation(({ password }) =>
                Promise.resolve({
                  data: { user: { ...user, password } },
                  error: null,
                }),
              ),
            signOut: jest.fn().mockResolvedValue({ error: null }),
          },
        };
      }),
    } as any);

    const [first, second] = await Promise.all([
      provider.completePasswordRecovery({
        accessToken: 'access-a',
        refreshToken: 'refresh-a',
        newPassword: 'password-a',
      }),
      provider.completePasswordRecovery({
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
        newPassword: 'password-b',
      }),
    ]);
    expect([first.id, second.id]).toEqual(['a', 'b']);
    expect(used).toEqual(['a', 'b']);
  });
});
