import { Inject, Injectable } from '@nestjs/common';
import {
  AuthIdentityProvider,
  AuthProviderError,
  InjectAuthIdentityProvider,
} from '../auth/auth-provider';

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
  constructor(
    @InjectAuthIdentityProvider()
    private readonly authProvider: AuthIdentityProvider,
  ) {}

  async create(input: { email: string; password: string; name: string }) {
    try {
      const user = await this.authProvider.createUser({
        email: input.email,
        password: input.password,
        metadata: { name: input.name },
      });
      return user;
    } catch (error) {
      const exists =
        error instanceof AuthProviderError &&
        error.code === 'email_already_exists';
      throw new AuthOperationError(
        exists ? 'AUTH_EMAIL_EXISTS' : 'AUTH_PROVIDER_ERROR',
        exists ? 'not-created' : 'unknown',
      );
    }
  }

  async delete(authUserId: string) {
    try {
      await this.authProvider.deleteUser(authUserId);
      return 'deleted' as const;
    } catch (error) {
      if (
        error instanceof AuthProviderError &&
        error.code === 'identity_not_found'
      )
        return 'absent' as const;
      return 'unknown' as const;
    }
  }

  async lookup(authUserId: string): Promise<AuthLookup> {
    try {
      const user = await this.authProvider.findById(authUserId);
      return user
        ? {
            status: 'found',
            user: { id: user.id, email: user.email },
          }
        : { status: 'absent' };
    } catch {
      return { status: 'unknown' };
    }
  }
}

export const InjectUserAuthAdapter = () => Inject(USER_AUTH_ADAPTER);
