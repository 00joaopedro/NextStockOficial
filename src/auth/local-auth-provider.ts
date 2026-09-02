import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EmployeeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalJwtService } from './local-jwt.service';
import {
  AuthIdentity,
  AuthIdentityProvider,
  AuthProviderError,
  AuthSessionResult,
} from './auth-provider';
import { PasswordHasher } from './local-password';

@Injectable()
export class LocalAuthProvider implements AuthIdentityProvider {
  readonly name = 'local' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: LocalJwtService,
    private readonly passwords: PasswordHasher,
  ) {}

  async createUser(input: {
    email: string;
    password: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuthIdentity> {
    const existing = await this.prisma.userProfile.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw new AuthProviderError('email_already_exists');
    const passwordHash = await this.passwords.hash(input.password);
    return {
      id: randomUUID(),
      email: input.email,
      metadata: { ...input.metadata, passwordHash },
    };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<AuthSessionResult> {
    const credential = await this.prisma.localCredential.findFirst({
      where: { profile: { email: input.email } },
      select: {
        profileId: true,
        passwordHash: true,
        credentialVersion: true,
        status: true,
        profile: {
          select: {
            email: true,
            employee: {
              select: { status: true, deletedAt: true, dismissalDate: true },
            },
          },
        },
      },
    });
    const valid = credential
      ? await this.passwords.compare(input.password, credential.passwordHash)
      : await this.passwords.dummyCompare(input.password);
    const employeeBlocked =
      credential?.profile.employee?.deletedAt ||
      credential?.profile.employee?.status === EmployeeStatus.inactive ||
      credential?.profile.employee?.status === EmployeeStatus.dismissed ||
      (credential?.profile.employee?.dismissalDate &&
        credential.profile.employee.dismissalDate <= new Date());
    if (
      !credential ||
      !valid ||
      credential.status !== 'active' ||
      employeeBlocked
    )
      throw new AuthProviderError('invalid_credentials');
    const accessToken = await this.jwt.sign({
      sub: credential.profileId,
      jti: randomUUID(),
      credentialVersion: credential.credentialVersion,
    });
    return {
      accessToken,
      identity: { id: credential.profileId, email: credential.profile.email },
    };
  }

  private unsupported(): AuthProviderError {
    return new AuthProviderError('unknown_provider_error');
  }
  refresh(): Promise<AuthSessionResult> {
    return Promise.reject(this.unsupported());
  }
  requestPasswordRecovery(): Promise<void> {
    return Promise.reject(this.unsupported());
  }
  verifyEmail(): Promise<AuthIdentity> {
    return Promise.reject(this.unsupported());
  }
  findById(): Promise<AuthIdentity | null> {
    return Promise.resolve(null);
  }
  findByEmail(): Promise<AuthIdentity | null> {
    return Promise.resolve(null);
  }
  deleteUser(): Promise<void> {
    return Promise.reject(this.unsupported());
  }
  revokeSessions(): Promise<void> {
    return Promise.reject(this.unsupported());
  }
  logout(): Promise<void> {
    return Promise.resolve();
  }
  getAuthenticatedIdentity(): Promise<AuthIdentity> {
    return Promise.reject(this.unsupported());
  }
}
