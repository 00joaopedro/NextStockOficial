import { Inject, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export const USER_AUTH_ADAPTER = Symbol('USER_AUTH_ADAPTER');

export type AuthResult = { id: string; email?: string };
export type AuthLookup =
  | { status: 'found'; user: AuthResult }
  | { status: 'absent' }
  | { status: 'unknown' };

export interface UserAuthAdapter {
  create(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<AuthResult>;
  delete(authUserId: string): Promise<'deleted' | 'absent' | 'unknown'>;
  lookup(authUserId: string): Promise<AuthLookup>;
}

export class AuthOperationError extends Error {
  constructor(
    public readonly code: string,
    public readonly outcome: 'not-created' | 'unknown',
  ) {
    super(code);
  }
}

@Injectable()
export class SupabaseUserAuthAdapter implements UserAuthAdapter {
  constructor(private readonly supabase: SupabaseService) {}

  async create(input: { email: string; password: string; name: string }) {
    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });
    if (error) {
      const code = this.code(error.message);
      throw new AuthOperationError(
        code,
        code === 'AUTH_EMAIL_EXISTS' ? 'not-created' : 'unknown',
      );
    }
    if (!data.user)
      throw new AuthOperationError('AUTH_EMPTY_RESPONSE', 'unknown');
    return { id: data.user.id, email: data.user.email };
  }

  async delete(authUserId: string) {
    try {
      const { error } =
        await this.supabase.admin.auth.admin.deleteUser(authUserId);
      if (!error) return 'deleted' as const;
      return this.code(error.message) === 'AUTH_NOT_FOUND'
        ? ('absent' as const)
        : ('unknown' as const);
    } catch {
      return 'unknown' as const;
    }
  }

  async lookup(authUserId: string): Promise<AuthLookup> {
    try {
      const { data, error } =
        await this.supabase.admin.auth.admin.getUserById(authUserId);
      if (error)
        return this.code(error.message) === 'AUTH_NOT_FOUND'
          ? { status: 'absent' }
          : { status: 'unknown' };
      return data.user
        ? {
            status: 'found',
            user: { id: data.user.id, email: data.user.email },
          }
        : { status: 'absent' };
    } catch {
      return { status: 'unknown' };
    }
  }

  private code(message: string) {
    const text = message.toLowerCase();
    if (
      text.includes('already') ||
      text.includes('registered') ||
      text.includes('exists')
    )
      return 'AUTH_EMAIL_EXISTS';
    if (text.includes('not found')) return 'AUTH_NOT_FOUND';
    return 'AUTH_PROVIDER_ERROR';
  }
}

export const InjectUserAuthAdapter = () => Inject(USER_AUTH_ADAPTER);
