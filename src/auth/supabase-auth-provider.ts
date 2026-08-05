import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthIdentityProvider, AuthProviderError } from './auth-provider';

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
      (u) => u.email?.trim().toLowerCase() === email,
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
    if (text.includes('email not confirmed'))
      return new AuthProviderError('email_not_verified');
    if ((error?.status ?? 0) >= 500)
      return new AuthProviderError('provider_unavailable');
    return new AuthProviderError(fallback);
  }
}
