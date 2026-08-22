import { AuditOutcome, PrismaClient } from '@prisma/client';
import { AuditOutboxService } from '../../src/audit/audit-outbox.service';
import { createBranch, createTenant } from '../factories/security.factory';

describe('RC-013 transactional audit outbox (PostgreSQL 16)', () => {
  const url =
    process.env.SECURITY_TEST_DATABASE_URL || process.env.DATABASE_URL;
  const first = new PrismaClient({ datasourceUrl: url });
  const second = new PrismaClient({ datasourceUrl: url });
  const workers = [
    new AuditOutboxService(first as any),
    new AuditOutboxService(second as any),
  ];

  afterAll(async () => {
    workers.forEach((worker) => worker.beforeApplicationShutdown());
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it.each([2, 20, 50, 100])(
    'converges %i concurrent processors on one authoritative event',
    async (count) => {
      const tenant = await createTenant(first);
      const branch = await createBranch(first, tenant);
      const operationId = `rc013:concurrent:${count}:${Date.now()}`;
      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          (index % 2 ? second : first).$transaction((tx) =>
            workers[index % 2].enqueue(tx, {
              tenantId: tenant.id,
              branchId: branch.id,
              operationId,
              eventType: 'test.audit_outbox',
              action: 'concurrency_test',
              outcome: AuditOutcome.SUCCESS,
              targetType: 'test_operation',
              targetId: operationId,
              metadata: { count },
            }),
          ),
        ),
      );
      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          workers[index % 2].processBatch(1),
        ),
      );
      const outbox = await first.auditOutboxEvent.findMany({
        where: { tenantId: tenant.id, operationId },
      });
      expect(outbox).toHaveLength(1);
      expect(outbox[0].status).toBe('DELIVERED');
      expect(
        await second.securityAuditEvent.count({
          where: { outboxEventId: outbox[0].id },
        }),
      ).toBe(1);
    },
    30_000,
  );

  it.each([2, 20, 100])(
    'delivers %i distinct operations without loss or cross-association',
    async (count) => {
      const tenant = await createTenant(first);
      const branch = await createBranch(first, tenant);
      const prefix = `rc013:many:${count}:${Date.now()}`;
      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          first.$transaction((tx) =>
            workers[0].enqueue(tx, {
              tenantId: tenant.id,
              branchId: branch.id,
              operationId: `${prefix}:${index}`,
              eventType: 'test.audit_outbox',
              action: 'multiple_operations_test',
              outcome: AuditOutcome.SUCCESS,
              targetType: 'test_operation',
              targetId: `${prefix}:${index}`,
            }),
          ),
        ),
      );
      while (
        (await first.auditOutboxEvent.count({
          where: { tenantId: tenant.id, deliveredAt: null },
        })) > 0
      )
        await Promise.all(workers.map((worker) => worker.processBatch(100)));
      const rows = await first.auditOutboxEvent.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, targetId: true },
      });
      const events = await second.securityAuditEvent.findMany({
        where: { outboxEventId: { in: rows.map((row) => row.id) } },
        select: { outboxEventId: true, targetId: true },
      });
      expect(rows).toHaveLength(count);
      expect(events).toHaveLength(count);
      expect(
        new Map(events.map((event) => [event.outboxEventId, event.targetId])),
      ).toEqual(new Map(rows.map((row) => [row.id, row.targetId])));
    },
    30_000,
  );

  it('rejects divergent payload reuse and preserves tenant-scoped identity', async () => {
    const [tenantA, tenantB] = await Promise.all([
      createTenant(first),
      createTenant(second),
    ]);
    const [branchA, branchB] = await Promise.all([
      createBranch(first, tenantA),
      createBranch(second, tenantB),
    ]);
    const operationId = `rc013:isolation:${Date.now()}`;
    const enqueue = (
      client: PrismaClient,
      tenantId: string,
      branchId: string,
      targetId: string,
    ) =>
      client.$transaction((tx) =>
        workers[0].enqueue(tx, {
          tenantId,
          branchId,
          operationId,
          eventType: 'test.audit_outbox',
          action: 'isolation_test',
          outcome: AuditOutcome.SUCCESS,
          targetType: 'test_operation',
          targetId,
        }),
      );
    await Promise.all([
      enqueue(first, tenantA.id, branchA.id, 'a'),
      enqueue(second, tenantB.id, branchB.id, 'b'),
    ]);
    await expect(
      enqueue(first, tenantA.id, branchA.id, 'divergent'),
    ).rejects.toThrow('AUDIT_OUTBOX_IDENTITY_CONFLICT');
    expect(await first.auditOutboxEvent.count({ where: { operationId } })).toBe(
      2,
    );
  });
});
