import { ConflictException } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { UsersService } from '../../src/users/users.service';
import { assertSafeTestDatabaseUrl } from '../helpers/test-database.guard';
import {
  createBranch,
  createProfile,
  createTenant,
} from '../factories/security.factory';
import { FakeUserAuthAdapter } from '../helpers/fake-user-auth.adapter';

describe('RC-009 recoverable user provisioning on PostgreSQL', () => {
  let a: PrismaClient;
  let b: PrismaClient;
  const url = assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL);

  beforeAll(async () => {
    a = new PrismaClient({ datasourceUrl: url });
    b = new PrismaClient({ datasourceUrl: url });
    await Promise.all([a.$connect(), b.$connect()]);
  });
  afterAll(async () => Promise.all([a.$disconnect(), b.$disconnect()]));

  async function fixture() {
    const tenant = await createTenant(a, { name: `RC009-${randomUUID()}` });
    const branch = await createBranch(a, tenant);
    const actor = await createProfile(a, {
      tenantId: tenant.id,
      role: Role.Admin,
    });
    return { tenant, branch, actor };
  }

  function service(
    prisma: PrismaClient,
    f: Awaited<ReturnType<typeof fixture>>,
    auth: FakeUserAuthAdapter,
  ) {
    const context = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: f.tenant.id,
        branchId: f.branch.id,
        userId: f.actor.id,
        role: Role.Admin,
      }),
    };
    const tenantAccess = {
      findTenantOrThrow: jest.fn().mockResolvedValue(f.tenant),
    };
    return new UsersService(
      prisma as any,
      tenantAccess as any,
      context as any,
      undefined,
      auth,
    );
  }

  it.each([2, 20, 100])(
    'allows one Auth call for %i equivalent concurrent requests',
    async (size) => {
      const f = await fixture();
      const auth = new FakeUserAuthAdapter();
      const left = service(a, f, auth);
      const right = service(b, f, auth);
      const releaseAuth = auth.barrier();
      const email = ` Race-${randomUUID()}@Example.COM `;
      const calls = Array.from({ length: size }, (_, i) =>
        (i % 2 ? left : right).create(
          { id: f.actor.id, role: Role.Admin } as any,
          {
            email: i % 3 ? email : email.toLowerCase(),
            name: 'Race User',
            password: 'not-persisted',
            role: Role.Vendedor,
          },
          f.branch.id,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      releaseAuth();
      const results = await Promise.allSettled(calls);
      expect(results.some((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      expect(
        results
          .filter((result) => result.status === 'rejected')
          .every(
            (result) =>
              result.status === 'rejected' &&
              result.reason instanceof ConflictException,
          ),
      ).toBe(true);
      expect(auth.createCalls).toBe(1);
      const canonicalEmail = email.trim().toLowerCase();
      expect(
        await a.userProvisioning.count({ where: { canonicalEmail } }),
      ).toBe(1);
      expect(
        await a.userProfile.count({ where: { email: canonicalEmail } }),
      ).toBe(1);
      expect(
        await a.tenantMember.count({
          where: {
            tenantId: f.tenant.id,
            userProfile: { email: canonicalEmail },
          },
        }),
      ).toBe(1);
      const stored = await a.userProvisioning.findUniqueOrThrow({
        where: { canonicalEmail },
      });
      expect(JSON.stringify(stored)).not.toContain('not-persisted');
    },
    90_000,
  );

  it('rejects a divergent payload with HTTP-compatible conflict and no second Auth call', async () => {
    const f = await fixture();
    const auth = new FakeUserAuthAdapter();
    const users = service(a, f, auth);
    const email = `${randomUUID()}@example.com`;
    await users.create(
      { id: f.actor.id } as any,
      { email, name: 'First', password: 'secret-a' },
      f.branch.id,
    );
    await expect(
      users.create(
        { id: f.actor.id } as any,
        { email, name: 'Different', password: 'secret-b' },
        f.branch.id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(auth.createCalls).toBe(1);
  });
});
