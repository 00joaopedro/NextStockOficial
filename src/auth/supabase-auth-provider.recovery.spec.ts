import { SupabaseAuthProvider } from './supabase-auth-provider';
import { PasswordRecoveryError } from './auth-provider';

describe('SupabaseAuthProvider recovery', () => {
  const user = { id: 'user-1', email: 'user@example.test', user_metadata: {} };
  const validSession = { data: { session: {}, user }, error: null };

  it('uses an isolated recovery client and updates the provider password', async () => {
    const setSession = jest.fn().mockResolvedValue({ error: null });
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const supabase = {
      createRecoveryClient: jest.fn().mockReturnValue({
        auth: { setSession, updateUser },
      }),
    };

    await new SupabaseAuthProvider(supabase as any).resetPasswordFromRecovery(
      'supabase-access-token',
      'supabase-refresh-token',
      'new-password-123',
    );

    expect(setSession).toHaveBeenCalledWith({
      access_token: 'supabase-access-token',
      refresh_token: 'supabase-refresh-token',
    });
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-password-123' });
  });

  it('does not update the password when the recovery session is invalid', async () => {
    const updateUser = jest.fn();
    const supabase = {
      createRecoveryClient: jest.fn().mockReturnValue({
        auth: {
          setSession: jest.fn().mockResolvedValue({ error: { status: 401 } }),
          updateUser,
        },
      }),
    };

    await expect(
      new SupabaseAuthProvider(supabase as any).resetPasswordFromRecovery(
        'not-a-valid-session',
        'not-a-valid-refresh-token',
        'new-password-123',
      ),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('does not update when setSession returns no session or no user', async () => {
    for (const data of [
      { session: null, user },
      { session: {}, user: null },
    ]) {
      const updateUser = jest.fn();
      const provider = new SupabaseAuthProvider({
        createRequestAnonClient: jest.fn().mockReturnValue({
          auth: {
            setSession: jest.fn().mockResolvedValue({ data, error: null }),
            updateUser,
          },
        }),
      } as any);
      await expect(
        provider.completePasswordRecovery({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          newPassword: 'new-password',
        }),
      ).rejects.toBeInstanceOf(PasswordRecoveryError);
      expect(updateUser).not.toHaveBeenCalled();
    }
  });

  it('revokes the same isolated recovery session after updating the password', async () => {
    const setSession = jest.fn().mockResolvedValue(validSession);
    const updateUser = jest.fn().mockResolvedValue({ data: { user }, error: null });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: jest.fn().mockReturnValue({
        auth: { setSession, updateUser, signOut },
      }),
    } as any);

    await expect(provider.completePasswordRecovery({
      accessToken: 'access-token', refreshToken: 'refresh-token', newPassword: 'new-password',
    })).resolves.toMatchObject({ id: user.id, recoverySessionRevoked: true });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it('does not sign out when updateUser fails', async () => {
    const signOut = jest.fn();
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: jest.fn().mockReturnValue({
        auth: {
          setSession: jest.fn().mockResolvedValue(validSession),
          updateUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { status: 401, code: 'bad_jwt' } }),
          signOut,
        },
      }),
    } as any);
    await expect(provider.completePasswordRecovery({
      accessToken: 'access-token', refreshToken: 'refresh-token', newPassword: 'new-password',
    })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('returns explicit partial success when global sign-out returns an error', async () => {
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: jest.fn().mockReturnValue({
        auth: {
          setSession: jest.fn().mockResolvedValue(validSession),
          updateUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
          signOut: jest.fn().mockResolvedValue({ error: { status: 503, code: 'network_error' } }),
        },
      }),
    } as any);
    await expect(provider.completePasswordRecovery({
      accessToken: 'access-token', refreshToken: 'refresh-token', newPassword: 'new-password',
    })).resolves.toMatchObject({
      id: user.id,
      recoverySessionRevoked: false,
      recoveryDiagnosticCode: 'RECOVERY_GLOBAL_SIGNOUT_FAILED',
      recoveryProviderCode: 'network_error',
    });
  });

  it('maps returned token/session errors and password policy errors without ignoring them', async () => {
    const updateUser = jest
      .fn()
      .mockResolvedValueOnce({
        data: { user: null },
        error: { status: 401, code: 'bad_jwt' },
      })
      .mockResolvedValueOnce({
        data: { user: null },
        error: {
          status: 400,
          code: 'weak_password',
          message: 'password policy',
        },
      });
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: jest.fn().mockReturnValue({
        auth: {
          setSession: jest.fn().mockResolvedValue(validSession),
          updateUser,
        },
      }),
    } as any);
    const input = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      newPassword: 'new-password',
    };
    await expect(
      provider.completePasswordRecovery(input),
    ).rejects.toMatchObject({
      code: 'invalid_credentials',
      diagnosticCode: 'RECOVERY_UPDATE_USER_FAILED',
      providerCode: 'bad_jwt',
    });
    await expect(
      provider.completePasswordRecovery(input),
    ).rejects.toMatchObject({
      code: 'password_policy',
      diagnosticCode: 'RECOVERY_PASSWORD_POLICY_REJECTED',
      providerCode: 'weak_password',
    });
  });

  it('classifies status-zero and retryable fetch failures as provider outages', async () => {
    const retryable = Object.assign(new Error('not logged'), {
      name: 'AuthRetryableFetchError', status: 0,
    });
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: jest.fn()
        .mockReturnValueOnce({ auth: { setSession: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: { status: 0, code: 'fetch_error' } }) } })
        .mockReturnValueOnce({ auth: { setSession: jest.fn().mockRejectedValue(retryable) } }),
    } as any);
    const input = { accessToken: 'access-token', refreshToken: 'refresh-token', newPassword: 'new-password' };
    await expect(provider.completePasswordRecovery(input)).rejects.toMatchObject({
      code: 'provider_unavailable', diagnosticCode: 'RECOVERY_SET_SESSION_FAILED', providerStatus: 0,
    });
    await expect(provider.completePasswordRecovery(input)).rejects.toMatchObject({
      code: 'provider_unavailable', diagnosticCode: 'RECOVERY_SET_SESSION_FAILED', providerStatus: 0,
    });
  });

  it('keeps ordinary status-400 recovery failures out of the outage path', async () => {
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient: jest.fn().mockReturnValue({
        auth: {
          setSession: jest.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { status: 400, code: 'bad_request' },
          }),
        },
      }),
    } as any);
    await expect(
      provider.completePasswordRecovery({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('uses a separate anonymous client for simultaneous recovery requests', async () => {
    const createRequestAnonClient = jest.fn(() => ({
      auth: {
        setSession: jest.fn().mockResolvedValue(validSession),
        updateUser: jest
          .fn()
          .mockResolvedValue({ data: { user }, error: null }),
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    }));
    const provider = new SupabaseAuthProvider({
      createRequestAnonClient,
    } as any);
    await Promise.all([
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
    expect(createRequestAnonClient).toHaveBeenCalledTimes(2);
  });
});
