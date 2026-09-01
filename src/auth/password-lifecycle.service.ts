import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher, validateLocalPassword } from './local-password';
import { authProviderMode } from './auth-provider-mode';
import {
  AuthIdentityProvider,
  InjectAuthIdentityProvider,
} from './auth-provider';
import {
  PasswordResetTokenService,
  PASSWORD_RESET_TTL_MS,
} from './password-reset-token.service';
import { PasswordEmailDelivery } from './password-delivery';
import { PASSWORD_EMAIL_DELIVERY } from './password-delivery';

const GENERIC_RESET_ERROR = 'Token de recuperacao invalido ou expirado.';

@Injectable()
export class PasswordLifecycleService {
  constructor(
    @InjectAuthIdentityProvider()
    private readonly legacyProvider: AuthIdentityProvider,
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHasher,
    private readonly tokens: PasswordResetTokenService,
    @Inject(PASSWORD_EMAIL_DELIVERY)
    private readonly delivery: PasswordEmailDelivery,
  ) {}

  private localEnabled() {
    return authProviderMode() === 'coexistence';
  }

  async request(email: string) {
    const generic = { ok: true, message: 'Password recovery email requested.' };
    if (
      !this.localEnabled() ||
      process.env.LOCAL_PASSWORD_RECOVERY_ENABLED !== 'true'
    )
      return generic;
    const profile = await this.prisma.userProfile.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        employee: { select: { status: true, deletedAt: true } },
        localCredential: { select: { credentialVersion: true, status: true } },
      },
    });
    if (
      !profile?.localCredential ||
      profile.localCredential.status !== 'active' ||
      profile.employee?.deletedAt ||
      (profile.employee && profile.employee.status !== 'active')
    ) {
      if (!profile?.localCredential)
        await this.legacyProvider.requestPasswordRecovery(
          email,
          process.env.SUPABASE_PASSWORD_REDIRECT_URL,
        );
      return generic;
    }
    const { raw, hash } = this.tokens.generate();
    const base = process.env.PUBLIC_APP_URL?.trim();
    if (!base || !/^https?:\/\/[^\s]+$/i.test(base)) return generic;
    const resetUrl = new URL('/reset-password', base);
    resetUrl.searchParams.set('token', raw);
    try {
      await this.delivery.send({
        email: profile.email,
        resetUrl: resetUrl.toString(),
      });
      await this.prisma.$transaction(async (tx: any) => {
        await tx.passwordResetToken.updateMany({
          where: { profileId: profile.id, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: {
            profileId: profile.id,
            tokenHash: hash,
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
            credentialVersion: profile.localCredential!.credentialVersion,
          },
        });
      });
    } catch {
      // Keep enumeration-resistant public behavior and avoid logging the secret.
    }
    return generic;
  }

  async reset(token: string, newPassword: string, requestToken?: string) {
    if (
      !this.localEnabled() ||
      process.env.LOCAL_PASSWORD_RECOVERY_ENABLED !== 'true'
    )
      throw new BadRequestException(GENERIC_RESET_ERROR);
    try {
      validateLocalPassword(newPassword);
    } catch {
      throw new BadRequestException('Senha invalida.');
    }
    const tokenHash = this.tokens.hash(token);
    const now = new Date();
    await this.prisma.$transaction(async (tx: any) => {
      const candidate = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          profileId: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
          credentialVersion: true,
          profile: {
            select: {
              localCredential: true,
              employee: { select: { status: true, deletedAt: true } },
            },
          },
        },
      });
      if (
        !candidate ||
        candidate.usedAt ||
        candidate.revokedAt ||
        candidate.expiresAt <= now ||
        !candidate.profile.localCredential ||
        candidate.profile.localCredential.status !== 'active' ||
        candidate.profile.employee?.deletedAt ||
        (candidate.profile.employee && candidate.profile.employee.status !== 'active') ||
        candidate.credentialVersion !==
          candidate.profile.localCredential?.credentialVersion
      )
        throw new BadRequestException(GENERIC_RESET_ERROR);
      if (
        await this.passwords.compare(
          newPassword,
          candidate.profile.localCredential.passwordHash,
        )
      )
        throw new BadRequestException('A nova senha deve ser diferente.');
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: candidate.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          credentialVersion: candidate.credentialVersion,
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1)
        throw new BadRequestException(GENERIC_RESET_ERROR);
      const hash = await this.passwords.hash(newPassword);
      const changed = await tx.localCredential.updateMany({
        where: {
          profileId: candidate.profileId,
          status: 'active',
          credentialVersion: candidate.credentialVersion,
        },
        data: {
          passwordHash: hash,
          parameters: { rounds: Number(process.env.LOCAL_BCRYPT_ROUNDS || 12) },
          credentialVersion: { increment: 1 },
          passwordChangedAt: now,
        },
      });
      if (changed.count !== 1)
        throw new BadRequestException(GENERIC_RESET_ERROR);
      await tx.userSession.updateMany({
        where: { profileId: candidate.profileId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'password_reset' },
      });
      await tx.passwordResetToken.updateMany({
        where: {
          profileId: candidate.profileId,
          id: { not: candidate.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    });
    return { ok: true };
  }

  async change(
    profileId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!this.localEnabled())
      throw new UnauthorizedException('Local password disabled.');
    try {
      validateLocalPassword(newPassword);
    } catch {
      throw new BadRequestException('Senha invalida.');
    }
    const credential = await this.prisma.localCredential.findUnique({
      where: { profileId },
      select: { passwordHash: true, status: true },
    });
    if (
      !credential ||
      credential.status !== 'active' ||
      !(await this.passwords.compare(currentPassword, credential.passwordHash))
    )
      throw new UnauthorizedException('Credenciais invalidas.');
    if (await this.passwords.compare(newPassword, credential.passwordHash))
      throw new BadRequestException('A nova senha deve ser diferente.');
    const hash = await this.passwords.hash(newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (tx: any) => {
      const changed = await tx.localCredential.updateMany({
        where: {
          profileId,
          passwordHash: credential.passwordHash,
          status: 'active',
        },
        data: {
          passwordHash: hash,
          parameters: { rounds: Number(process.env.LOCAL_BCRYPT_ROUNDS || 12) },
          credentialVersion: { increment: 1 },
          passwordChangedAt: now,
        },
      });
      if (changed.count !== 1)
        throw new UnauthorizedException('Credenciais invalidas.');
      await tx.passwordResetToken.updateMany({
        where: { profileId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.userSession.updateMany({
        where: { profileId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'password_changed' },
      });
    });
    return { ok: true };
  }
}
