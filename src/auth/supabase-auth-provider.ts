import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AuthIdentityProvider,
  AuthProviderError,
  PasswordRecoveryError,
  RecoveryDiagnosticCode,
} from './auth-provider';
import { canonicalizeEmail } from '../common/canonical-email';

@Injectable()
export class SupabaseAuthProvider implements AuthIdentityProvider {
  readonly name = 'supabase' as const;
  constructor(private readonly supabase: SupabaseService) {}

  async createUser(input: {
    email: string;
    password: string;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: input.metadata,
    });
    if (error) throw this.error(error);
    if (!data.user) throw new AuthProviderError('unknown_provider_error');
    return {
      id: data.user.id,
      email: data.user.email,
      metadata: data.user.user_metadata,
    };
  }
  async login(input: { email: string; password: string }) {
    const { data, error } =
      await this.supabase.anon.auth.signInWithPassword(input);
    if (error) throw this.error(error, 'invalid_credentials');
    if (!data.user || !data.session?.access_token)
      throw new AuthProviderError('invalid_credentials');
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      identity: {
        id: data.user.id,
        email: data.user.email,
        metadata: data.user.user_metadata,
      },
    };
  }
  async refresh(refreshToken: string) {
    const { data, error } = await this.supabase.anon.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.user || !data.session?.access_token)
      throw this.error(error, 'invalid_credentials');
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      identity: {
        id: data.user.id,
        email: data.user.email,
        metadata: data.user.user_metadata,
      },
    };
  }
  async requestPasswordRecovery(email: string, redirectTo?: string) {
    const { error } = await this.supabase.anon.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) throw this.error(error);
  }
  async resetPasswordFromRecovery(
    accessToken: string,
    refreshToken: string,
    newPassword: string,
  ) {
    const client = this.supabase.createRecoveryClient();
    const { error: sessionError } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw this.error(sessionError, 'invalid_credentials');
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw this.error(error, 'invalid_credentials');
  }
  async completePasswordRecovery(input: {
    accessToken: string;
    refreshToken: string;
    newPassword: string;
  }) {
    const client = this.supabase.createRequestAnonClient();
    let sessionResult: Awaited<ReturnType<typeof client.auth.setSession>>;
    try {
      sessionResult = await client.auth.setSession({
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
      });
    } catch (error) {
      throw this.recoveryError('RECOVERY_SET_SESSION_FAILED', error);
    }
    if (sessionResult.error)
      throw this.recoveryError(
        'RECOVERY_SET_SESSION_FAILED',
        sessionResult.error,
      );
    if (!sessionResult.data.session)
      throw new PasswordRecoveryError(
        'invalid_credentials',
        'RECOVERY_SESSION_MISSING',
      );
    if (!sessionResult.data.user)
      throw new PasswordRecoveryError(
        'invalid_credentials',
        'RECOVERY_USER_MISSING',
      );

    let updateResult: Awaited<ReturnType<typeof client.auth.updateUser>>;
    try {
      updateResult = await client.auth.updateUser({
        password: input.newPassword,
      });
    } catch (error) {
      throw this.recoveryError('RECOVERY_UPDATE_USER_FAILED', error);
    }
    if (updateResult.error)
      throw this.recoveryError(
        'RECOVERY_UPDATE_USER_FAILED',
        updateResult.error,
      );
    if (!updateResult.data.user)
      throw new PasswordRecoveryError(
        'unknown_provider_error',
        'RECOVERY_UPDATE_USER_FAILED',
      );
    return {
      id: updateResult.data.user.id,
      email: updateResult.data.user.email,
      metadata: updateResult.data.user.user_metadata,
    };
  }

  private recoveryError(stage: RecoveryDiagnosticCode, error: unknown) {
    const provider = this.recoveryProviderMetadata(error);
    const text = this.providerErrorText(error);
    const code =
      provider.status === 429
        ? 'rate_limited'
        : provider.status !== undefined && provider.status >= 500
          ? 'provider_unavailable'
          : this.isPasswordPolicyError(text)
            ? 'password_policy'
            : this.isInvalidRecoverySession(provider.status, text)
              ? 'invalid_credentials'
              : 'unknown_provider_error';
    return new PasswordRecoveryError(
      code,
      code === 'password_policy' ? 'RECOVERY_PASSWORD_POLICY_REJECTED' : stage,
      provider.status,
      provider.code,
    );
  }

  private recoveryProviderMetadata(error: unknown) {
    const value =
      error && typeof error === 'object'
        ? (error as {
            status?: unknown;
            code?: unknown;
          })
        : {};
    const status = Number(value.status);
    const rawCode = typeof value.code === 'string' ? value.code : '';
    return {
      status:
        Number.isInteger(status) && status >= 400 && status <= 599
          ? status
          : undefined,
      code: /^[a-z0-9_]{1,64}$/i.test(rawCode) ? rawCode : undefined,
    };
  }

  private providerErrorText(error: unknown) {
    return error &&
      typeof error === 'object' &&
      typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.toLowerCase()
      : '';
  }

  private isPasswordPolicyError(text: string) {
    return (
      text.includes('password') &&
      ['weak', 'least', 'length', 'policy'].some((term) => text.includes(term))
    );
  }

  private isInvalidRecoverySession(status: number | undefined, text: string) {
    return (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      ['token', 'session', 'jwt', 'refresh', 'expired', 'invalid'].some(
        (term) => text.includes(term),
      )
    );
  }
  async verifyEmail(token: string) {
    const { data, error } = await this.supabase.anon.auth.verifyOtp({
      token_hash: token,
      type: 'email',
    });
    if (error || !data.user) throw this.error(error);
    return {
      id: data.user.id,
      email: data.user.email,
      metadata: data.user.user_metadata,
    };
  }
  async findById(id: string) {
    const { data, error } =
      await this.supabase.admin.auth.admin.getUserById(id);
    if (error) {
      if (this.error(error).code === 'identity_not_found') return null;
      throw this.error(error);
    }
    return data.user
      ? {
          id: data.user.id,
          email: data.user.email,
          metadata: data.user.user_metadata,
        }
      : null;
  }
  async findByEmail(email: string) {
    const { data, error } = await this.supabase.admin.auth.admin.listUsers();
    if (error) throw this.error(error);
    const user = data.users.find(
      (u) => u.email && canonicalizeEmail(u.email) === canonicalizeEmail(email),
    );
    return user
      ? { id: user.id, email: user.email, metadata: user.user_metadata }
      : null;
  }
  async deleteUser(id: string) {
    const { error } = await this.supabase.admin.auth.admin.deleteUser(id);
    if (error) throw this.error(error);
  }
  async revokeSessions(id: string) {
    const { error } = await this.supabase.admin.auth.admin.signOut(
      id,
      'global',
    );
    if (error) throw this.error(error);
  }
  async logout(_accessToken?: string, _global = false) {
    const { error } = await this.supabase.anon.auth.signOut({
      scope: _global ? 'global' : 'local',
    });
    if (error) throw this.error(error);
  }
  async getAuthenticatedIdentity(accessToken: string) {
    const { data, error } = await this.supabase.anon.auth.getUser(accessToken);
    if (error || !data.user) throw this.error(error, 'invalid_credentials');
    return {
      id: data.user.id,
      email: data.user.email,
      metadata: data.user.user_metadata,
    };
  }

  private error(
    error: { message?: string; status?: number; code?: string } | null,
    fallback:
      | 'invalid_credentials'
      | 'unknown_provider_error' = 'unknown_provider_error',
  ) {
    const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
    if (error?.status === 429) return new AuthProviderError('rate_limited');
    if (
      text.includes('already') ||
      text.includes('exists') ||
      text.includes('registered')
    )
      return new AuthProviderError('email_already_exists');
    if (text.includes('not found'))
      return new AuthProviderError('identity_not_found');
    if (
      text.includes('password') &&
      (text.includes('weak') ||
        text.includes('least') ||
        text.includes('length') ||
        text.includes('policy'))
    )
      return new AuthProviderError('password_policy');
    if (text.includes('email not confirmed'))
      return new AuthProviderError('email_not_verified');
    if ((error?.status ?? 0) >= 500)
      return new AuthProviderError('provider_unavailable');
    return new AuthProviderError(fallback);
  }
}
