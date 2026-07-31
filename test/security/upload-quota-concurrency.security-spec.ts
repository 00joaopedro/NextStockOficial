import { ConflictException, PayloadTooLargeException } from '@nestjs/common';
import {
  PrismaClient,
  Role,
  UploadQuotaReservationState,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { UploadQuotaService } from '../../src/storage/upload-quota.service';
import {
  createBranch,
  createMembership,
  createProfile,
  createTenant,
} from '../factories/security.factory';
import { assertSafeTestDatabaseUrl } from '../helpers/test-database.guard';

describe('RC-008 atomic upload quota reservations on PostgreSQL 16', () => {
  let first: PrismaClient;
  let second: PrismaClient;
  const tenantIds: string[] = [];
  const url = assertSafeTestDatabaseUrl(process.env.SECURITY_TEST_DATABASE_URL);

  beforeAll(async () => {
    process.env.UPLOAD_ENABLE_QUOTAS = 'true';
    first = new PrismaClient({ datasourceUrl: url });
    second = new PrismaClient({ datasourceUrl: url });
    await Promise.all([first.$connect(), second.$connect()]);
  });

  afterAll(async () => {
    try {
      for (const tenantId of tenantIds) {
        await first.storedFile.deleteMany({ where: { tenantId } });
        await first.uploadQuotaReservation.deleteMany({ where: { tenantId } });
        await first.uploadQuotaCounter.deleteMany({ where: { tenantId } });
        await first.tenantMember.deleteMany({ where: { tenantId } });
        await first.userProfile.deleteMany({ where: { tenantId } });
        await first.branch.deleteMany({ where: { tenantId } });
        await first.tenant.delete({ where: { id: tenantId } });
      }
      // SecurityAuditEvent remains untouched because its ledger is append-only.
    } finally {
      await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    }
  });

  async function fixture() {
    const tenant = await createTenant(first, { name: `RC008-${randomUUID()}` });
    tenantIds.push(tenant.id);
    const branch = await createBranch(first, tenant);
    const profile = await createProfile(first, {
      tenantId: tenant.id,
      role: Role.Admin,
    });
    await createMembership(first, profile, tenant, branch, Role.Admin);
    return { tenant, branch, profile };
  }

  function configure(
    tenantBytes: number,
    files: number,
    userBytes = tenantBytes,
  ) {
    process.env.UPLOAD_STORAGE_BYTES_PER_TENANT = String(tenantBytes);
    process.env.UPLOAD_DAILY_BYTES_PER_TENANT = String(tenantBytes);
    process.env.UPLOAD_DAILY_FILES_PER_TENANT = String(files);
    process.env.UPLOAD_DAILY_BYTES_PER_USER = String(userBytes);
  }

  async function reserve(
    service: UploadQuotaService,
    f: Awaited<ReturnType<typeof fixture>>,
    key = randomUUID(),
    bytes = 6,
  ) {
    const objectKey = `${f.tenant.id}/${f.branch.id}/products/${key}.webp`;
    return service.reserve({
      tenantId: f.tenant.id,
      branchId: f.branch.id,
      ownerProfileId: f.profile.id,
      incomingBytes: bytes,
      incomingFiles: 1,
      idempotencyKey: key,
      objectKeys: [objectKey],
    });
  }

  it.each([2, 20, 100])(
    'allows only capacity and calls fake Storage only for winners with %i contenders',
    async (size) => {
      configure(10, 1);
      const f = await fixture();
      const services = [
        new UploadQuotaService(first as any),
        new UploadQuotaService(second as any),
      ];
      const fakeStorage = jest.fn().mockResolvedValue(undefined);
      let open!: () => void;
      const barrier = new Promise<void>((resolve) => {
        open = resolve;
      });
      const calls = Array.from({ length: size }, async (_, index) => {
        await barrier;
        const reservation = await reserve(services[index % 2], f);
        if (reservation) await fakeStorage(reservation.objectKeys[0]);
        return reservation;
      });
      open();
      const settled = await Promise.allSettled(calls);
      const winners = settled.filter((result) => result.status === 'fulfilled');
      const losers = settled.filter((result) => result.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(
        losers.every(
          (result) =>
            result.status === 'rejected' &&
            result.reason instanceof PayloadTooLargeException,
        ),
      ).toBe(true);
      expect(fakeStorage).toHaveBeenCalledTimes(winners.length);
      const counters = await first.uploadQuotaCounter.findMany({
        where: { tenantId: f.tenant.id },
      });
      expect(
        counters.every(
          (counter) =>
            counter.confirmedBytes + counter.reservedBytes <= counter.byteLimit,
        ),
      ).toBe(true);
      expect(
        counters.every(
          (counter) =>
            counter.confirmedFiles + counter.reservedFiles <= counter.fileLimit,
        ),
      ).toBe(true);
    },
    90_000,
  );

  it('is idempotent across Prisma instances and rejects a divergent path', async () => {
    configure(100, 10);
    const f = await fixture();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      reserve(new UploadQuotaService(first as any), f, key),
      reserve(new UploadQuotaService(second as any), f, key),
    ]);
    expect(a?.id).toBe(b?.id);
    expect(
      await first.uploadQuotaReservation.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(1);
    await expect(
      new UploadQuotaService(first as any).reserve({
        tenantId: f.tenant.id,
        branchId: f.branch.id,
        ownerProfileId: f.profile.id,
        incomingBytes: 6,
        incomingFiles: 1,
        idempotencyKey: key,
        objectKeys: [`${f.tenant.id}/different`],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back every tenant scope when the simultaneous user scope fails', async () => {
    configure(100, 10, 5);
    const f = await fixture();
    await expect(
      reserve(new UploadQuotaService(first as any), f),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(
      await first.uploadQuotaReservation.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
    expect(
      await first.uploadQuotaCounter.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });

  it('makes confirm and release exactly-once and preserves uncertain failures', async () => {
    configure(100, 10);
    const f = await fixture();
    const service = new UploadQuotaService(first as any);
    const confirmed = await reserve(service, f);
    expect(await service.confirm(confirmed!.id)).toBe(true);
    expect(await service.confirm(confirmed!.id)).toBe(false);
    const released = await reserve(service, f);
    expect(await service.release(released!.id)).toBe(true);
    expect(await service.release(released!.id)).toBe(false);
    const uncertain = await reserve(service, f);
    await service.requireReconciliation(
      uncertain!.id,
      new Error('external outcome unknown'),
    );
    expect(
      (
        await first.uploadQuotaReservation.findUniqueOrThrow({
          where: { id: uncertain!.id },
        })
      ).state,
    ).toBe(UploadQuotaReservationState.RECONCILIATION_REQUIRED);
  });

  it('claims expired reservations in a bounded, reentrant batch without releasing them', async () => {
    configure(100, 10);
    const f = await fixture();
    const service = new UploadQuotaService(first as any);
    const expired = await service.reserve({
      tenantId: f.tenant.id,
      branchId: f.branch.id,
      ownerProfileId: f.profile.id,
      incomingBytes: 1,
      incomingFiles: 1,
      idempotencyKey: randomUUID(),
      objectKeys: [`${f.tenant.id}/${randomUUID()}`],
      expiresAt: new Date(0),
    });
    expect((await service.claimExpired(10)).map(({ id }) => id)).toContain(
      expired!.id,
    );
    expect(await service.claimExpired(10)).toHaveLength(0);
    const row = await first.uploadQuotaReservation.findUniqueOrThrow({
      where: { id: expired!.id },
    });
    expect(row.state).toBe(UploadQuotaReservationState.EXPIRED);
    const counters = await first.uploadQuotaCounter.findMany({
      where: { tenantId: f.tenant.id },
    });
    expect(counters.every((counter) => counter.reservedBytes === 1n)).toBe(
      true,
    );
  });

  it('rejects foreign branch/owner scopes and non-tenant/traversal paths', async () => {
    configure(100, 10);
    const owner = await fixture();
    const foreign = await fixture();
    const service = new UploadQuotaService(first as any);
    await expect(
      service.reserve({
        tenantId: owner.tenant.id,
        branchId: foreign.branch.id,
        ownerProfileId: owner.profile.id,
        incomingBytes: 1,
        idempotencyKey: randomUUID(),
        objectKeys: [`${owner.tenant.id}/safe`],
      }),
    ).rejects.toBeDefined();
    await expect(
      service.reserve({
        tenantId: owner.tenant.id,
        branchId: owner.branch.id,
        ownerProfileId: foreign.profile.id,
        incomingBytes: 1,
        idempotencyKey: randomUUID(),
        objectKeys: [`${owner.tenant.id}/safe`],
      }),
    ).rejects.toBeDefined();
    await expect(
      service.reserve({
        tenantId: owner.tenant.id,
        incomingBytes: 1,
        idempotencyKey: randomUUID(),
        objectKeys: [`${foreign.tenant.id}/../escape`],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
