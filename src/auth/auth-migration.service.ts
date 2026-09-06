import { ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AuthIdentityProvider } from '@prisma/client';
import { canonicalizeEmail } from '../common/canonical-email';
import { PrismaService } from '../prisma/prisma.service';
import { authProviderMode } from './auth-provider-mode';
import { PasswordHasher } from './local-password';

const KIND = 'legacy_password_jit';
const STALE_MS = 5 * 60_000;

export type LegacyMigrationInput = {
  sourceProvider: 'supabase' | 'supertokens';
  sourceSubject: string;
  profileId: string;
  email: string;
  password: string;
};

function enabled() {
  return (
    process.env.AUTH_MIGRATION_ENABLED === 'true' &&
    process.env.AUTH_MIGRATION_JIT_ENABLED === 'true' &&
    authProviderMode() === 'coexistence'
  );
}

@Injectable()
export class AuthMigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHasher,
  ) {}

  async migrateAfterLegacyAuthentication(input: LegacyMigrationInput) {
    if (!enabled()) return { status: 'skipped' as const, reason: 'disabled' };
    if (!input.sourceSubject || !input.profileId || !input.password)
      return { status: 'skipped' as const, reason: 'invalid_input' };
    const sourceSubjectHash = createHash('sha256')
      .update(input.sourceSubject)
      .digest('hex');
    const claimToken = randomUUID();
    const now = new Date();
    const stale = new Date(now.getTime() - STALE_MS);
    const ledger = await this.prisma.authMigrationLedger.upsert({
      where: {
        sourceProvider_sourceSubjectHash_migrationKind: {
          sourceProvider: input.sourceProvider,
          sourceSubjectHash,
          migrationKind: KIND,
        },
      },
      create: {
        sourceProvider: input.sourceProvider,
        sourceSubjectHash,
        migrationKind: KIND,
        status: 'pending',
        version: 0,
      },
      update: {},
      select: { id: true, status: true, version: true, startedAt: true },
    });
    if (ledger.status === 'succeeded')
      return { status: 'already_migrated' as const };
    if (ledger.status === 'unknown')
      return { status: 'blocked' as const, reason: 'reconciliation_required' };
    const claimed = await this.prisma.authMigrationLedger.updateMany({
      where: {
        id: ledger.id,
        version: ledger.version,
        OR: [
          { status: 'pending' },
          { status: 'failed' },
          { status: 'processing', startedAt: { lt: stale } },
        ],
      },
      data: {
        status: 'processing',
        claimToken,
        startedAt: now,
        attempt: { increment: 1 },
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return { status: 'already_processing' as const };
    try {
      const passwordHash = await this.passwords.hashVerifiedLegacyPassword(
        input.password,
      );
      const result = await this.prisma.$transaction(async (tx) => {
        const profile = await tx.userProfile.findUnique({
          where: { id: input.profileId },
          select: {
            id: true,
            email: true,
            employee: { select: { status: true, deletedAt: true } },
          },
        });
        if (
          !profile ||
          canonicalizeEmail(profile.email) !== canonicalizeEmail(input.email) ||
          profile.employee?.deletedAt ||
          profile.employee?.status === 'inactive' ||
          profile.employee?.status === 'dismissed'
        )
          throw new ConflictException('Migration identity is not eligible.');
        const identity = await tx.authIdentity.findUnique({
          where: {
            provider_providerSubject: {
              provider:
                input.sourceProvider === 'supabase'
                  ? AuthIdentityProvider.SUPABASE
                  : AuthIdentityProvider.SUPERTOKENS,
              providerSubject: input.sourceSubject,
            },
          },
          select: {
            id: true,
            userProfileId: true,
            status: true,
            disabledAt: true,
          },
        });
        if (
          identity &&
          (identity.userProfileId !== profile.id ||
            identity.status !== 'active' ||
            identity.disabledAt)
        )
          throw new ConflictException('Migration identity conflict.');
        const linked =
          identity ??
          (await tx.authIdentity.create({
            data: {
              userProfileId: profile.id,
              provider:
                input.sourceProvider === 'supabase'
                  ? AuthIdentityProvider.SUPABASE
                  : AuthIdentityProvider.SUPERTOKENS,
              providerSubject: input.sourceSubject,
              canonicalEmail: canonicalizeEmail(input.email),
              emailVerifiedAt: new Date(),
              migrationState: 'MIGRATED',
              passwordStrategy: 'migrate_on_login',
            },
            select: { id: true },
          }));
        await tx.localCredential.upsert({
          where: { profileId: profile.id },
          create: {
            profileId: profile.id,
            passwordHash,
            algorithm: 'bcryptjs',
            parameters: {
              rounds: Number(process.env.LOCAL_BCRYPT_ROUNDS || 12),
            },
            credentialVersion: 1,
            status: 'active',
          },
          update: {},
        });
        await tx.authMigrationLedger.updateMany({
          where: { id: ledger.id, claimToken, status: 'processing' },
          data: {
            status: 'succeeded',
            authIdentityId: linked.id,
            userProfileId: profile.id,
            completedAt: new Date(),
            version: { increment: 1 },
          },
        });
        return { status: 'migrated' as const };
      });
      return result;
    } catch (error) {
      await this.prisma.authMigrationLedger.updateMany({
        where: { id: ledger.id, claimToken, status: 'processing' },
        data: {
          status: 'failed',
          lastErrorCode:
            error instanceof ConflictException
              ? 'CONFLICT'
              : 'TRANSIENT_FAILURE',
          version: { increment: 1 },
        },
      });
      throw error;
    }
  }
}
