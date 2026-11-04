import { ConflictException } from '@nestjs/common';
import { PrismaClient, SystemType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../../src/auth/auth.service';
import type { AuthIdentityProvider } from '../../src/auth/auth-provider';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { DevWorkspaceService } from '../../src/tenancy/dev-workspace.service';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const suite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;
suite('registration recovery CAS on PostgreSQL', () => {
  let a: PrismaClient;
  let b: PrismaClient;
  beforeAll(() => {
    const url = assertSafeTestDatabaseUrl(
      process.env.SECURITY_TEST_DATABASE_URL,
    );
    a = new PrismaClient({ datasourceUrl: url });
    b = new PrismaClient({ datasourceUrl: url });
  });
  afterAll(async () => {
    await Promise.all([a?.$disconnect(), b?.$disconnect()]);
  });

  it('allows one recovery claim and retains the unique email', async () => {
    const id = randomUUID();
    const email = `recovery-${id}@example.test`;
    const key = `recovery:${id}`;
    await a.registrationIntent.create({
      data: {
        id,
        canonicalEmail: email,
        idempotencyKey: key,
        payloadHash: 'old',
        requestedName: 'Old',
        companyName: 'Old',
        systemType: 'padrao',
        state: 'FAILED_RETRYABLE',
        lastErrorCode: 'AUTH_LOOKUP_FAILED_BEFORE_CREATE',
      },
    });
    const provider = {
      findByEmail: jest.fn().mockResolvedValue(null),
    } as unknown as AuthIdentityProvider;
    const first = new AuthService(
      provider,
      a as unknown as PrismaService,
      {} as DevWorkspaceService,
    );
    const second = new AuthService(
      provider,
      b as unknown as PrismaService,
      {} as DevWorkspaceService,
    );
    const input = {
      email,
      idempotencyKey: key,
      payloadHash: 'new',
      name: 'New name',
      companyName: 'New company',
      systemType: SystemType.padrao,
      referralPartnerId: null,
    };
    const claim = (service: AuthService) =>
      (
        service as unknown as {
          claimRegistrationIntent(data: typeof input): Promise<unknown>;
        }
      ).claimRegistrationIntent(input);
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) => claim(i % 2 ? first : second)),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const result of results)
        if (result.status === 'rejected')
          expect(result.reason).toBeInstanceOf(ConflictException);
      const row = await a.registrationIntent.findUniqueOrThrow({
        where: { id },
      });
      expect(row).toMatchObject({
        canonicalEmail: email,
        payloadHash: 'new',
        requestedName: 'New name',
        state: 'CLAIMED',
        attempts: 2,
      });
      expect(
        await a.registrationIntent.count({ where: { canonicalEmail: email } }),
      ).toBe(1);
      expect(await a.userProfile.count({ where: { email } })).toBe(0);
    } finally {
      await a.registrationIntent.deleteMany({ where: { id } });
    }
  });
});
