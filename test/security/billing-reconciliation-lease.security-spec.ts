import { PrismaClient } from '@prisma/client';
import { ReconciliationSchedulerService } from '../../src/billing/reconciliation-scheduler.service';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const suite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;
suite('billing reconciliation lease across instances', () => {
  let a: PrismaClient;
  let b: PrismaClient;
  beforeAll(async () => {
    const url = assertSafeTestDatabaseUrl(
      process.env.SECURITY_TEST_DATABASE_URL,
    );
    a = new PrismaClient({ datasourceUrl: url });
    b = new PrismaClient({ datasourceUrl: url });
    await a.$executeRaw`DELETE FROM "billing_reconciliation_lease" WHERE "key" = 'production'`;
  });
  afterAll(async () => {
    if (a)
      await a.$executeRaw`DELETE FROM "billing_reconciliation_lease" WHERE "key" = 'production'`;
    await Promise.all([a?.$disconnect(), b?.$disconnect()]);
  });
  it('allows one worker at a time and permits a new run after release', async () => {
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const firstBatch = jest.fn(async () => {
      started();
      await held;
      return { failed: 0 };
    });
    const secondBatch = jest.fn().mockResolvedValue({ failed: 0 });
    const first = new ReconciliationSchedulerService(
      a as any,
      { reconcilePendingBatch: firstBatch } as any,
    );
    const second = new ReconciliationSchedulerService(
      b as any,
      { reconcilePendingBatch: secondBatch } as any,
    );
    const run = first.runOnce();
    await ready;
    try {
      await second.runOnce();
      expect(secondBatch).not.toHaveBeenCalled();
    } finally {
      release();
      await run;
    }
    await second.runOnce();
    expect(secondBatch).toHaveBeenCalledTimes(1);
  });
});
