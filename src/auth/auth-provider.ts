import { Inject } from '@nestjs/common';

export const AUTH_IDENTITY_PROVIDER = Symbol('AUTH_IDENTITY_PROVIDER');

export type AuthProviderErrorCode =
  | 'invalid_credentials'
  | 'email_already_exists'
  | 'identity_not_found'
  | 'email_not_verified'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'conflict'
  | 'compensation_required'
  | 'unknown_provider_error';

export class AuthProviderError extends Error {
  constructor(public readonly code: AuthProviderErrorCode) {
    super(code);
    this.name = 'AuthProviderError';
  }
}

export interface AuthIdentity {
  id: string;
  email?: string;
  metadata?: Record<string, unknown> | null;
}
export interface AuthSessionResult {
  accessToken: string;
  refreshToken?: string;
  identity: AuthIdentity;
}

/** Provider boundary. Domain authorization and tenancy deliberately do not belong here. */
export interface AuthIdentityProvider {
  readonly name: 'supabase';
  createUser(input: {
    email: string;
    password: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuthIdentity>;
  login(input: { email: string; password: string }): Promise<AuthSessionResult>;
  refresh(refreshToken: string): Promise<AuthSessionResult>;
  requestPasswordRecovery(email: string, redirectTo?: string): Promise<void>;
  verifyEmail(token: string): Promise<AuthIdentity>;
  findById(id: string): Promise<AuthIdentity | null>;
  findByEmail(canonicalEmail: string): Promise<AuthIdentity | null>;
  deleteUser(id: string): Promise<void>;
  revokeSessions(id: string): Promise<void>;
  logout(accessToken?: string, global?: boolean): Promise<void>;
  getAuthenticatedIdentity(accessToken: string): Promise<AuthIdentity>;
}

export const InjectAuthIdentityProvider = () => Inject(AUTH_IDENTITY_PROVIDER);
