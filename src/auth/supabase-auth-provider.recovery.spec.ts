import { SupabaseAuthProvider } from './supabase-auth-provider';

describe('SupabaseAuthProvider recovery', () => {
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
});
