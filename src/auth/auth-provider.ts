import { Inject } from '@nestjs/common';

export const AUTH_IDENTITY_PROVIDER = Symbol('AUTH_IDENTITY_PROVIDER');

export type AuthProviderErrorCode =
  | 'invalid_credentials'
  | 'password_policy'
  | 'email_already_exists'
  | 'identity_not_found'
  | 'email_not_verified'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'conflict'
  | 'compensation_required'
  | 'recovery_finalization_failed'
  | 'unknown_provider_error';

export class AuthProviderError extends Error {
  constructor(public readonly code: AuthProviderErrorCode) {
    super(code);
    this.name = 'AuthProviderError';
  }
}

export type RecoveryDiagnosticCode =
  | 'RECOVERY_SET_SESSION_FAILED'
  | 'RECOVERY_SESSION_MISSING'
  | 'RECOVERY_USER_MISSING'
  | 'RECOVERY_UPDATE_USER_FAILED'
  | 'RECOVERY_PASSWORD_POLICY_REJECTED'
  | 'RECOVERY_GLOBAL_SIGNOUT_FAILED';

/** Carries only pre-sanitized provider metadata; never the provider message. */
export class PasswordRecoveryError extends AuthProviderError {
  constructor(
    code: AuthProviderErrorCode,
    public readonly diagnosticCode: RecoveryDiagnosticCode,
    public readonly providerStatus?: number,
    public readonly providerCode?: string,
  ) {
    super(code);
    this.name = 'PasswordRecoveryError';
  }
}

export interface AuthIdentity {
  id: string;
  email?: string;
  metadata?: Record<string, unknown> | null;
}
export type PasswordRecoveryResult = AuthIdentity & {
  recoverySessionRevoked: boolean;
  recoveryDiagnosticCode?: 'RECOVERY_GLOBAL_SIGNOUT_FAILED';
  recoveryProviderStatus?: number;
  recoveryProviderCode?: string;
};
export interface AuthSessionResult {
  accessToken: string;
  refreshToken?: string;
  identity: AuthIdentity;
  provider?: 'supabase' | 'local';
}

/** Provider boundary. Domain authorization and tenancy deliberately do not belong here. */
export interface AuthIdentityProvider {
  readonly name:
    | 'supabase'
    | 'local'
    | 'coexistence'
    | 'google'
    | 'supertokens';
  createUser(input: {
    email: string;
    password: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuthIdentity>;
  login(input: { email: string; password: string }): Promise<AuthSessionResult>;
  refresh(refreshToken: string): Promise<AuthSessionResult>;
  requestPasswordRecovery(email: string, redirectTo?: string): Promise<void>;
  completePasswordRecovery(input: { accessToken: string; refreshToken: string; newPassword: string }): Promise<PasswordRecoveryResult>;
  verifyEmail(token: string): Promise<AuthIdentity>;
  findById(id: string): Promise<AuthIdentity | null>;
  findByEmail(canonicalEmail: string): Promise<AuthIdentity | null>;
  deleteUser(id: string): Promise<void>;
  revokeSessions(id: string): Promise<void>;
  logout(accessToken?: string, global?: boolean): Promise<void>;
  getAuthenticatedIdentity(accessToken: string): Promise<AuthIdentity>;
}

export const InjectAuthIdentityProvider = () => Inject(AUTH_IDENTITY_PROVIDER);
