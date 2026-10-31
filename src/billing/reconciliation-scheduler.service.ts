import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { startsApi, processRole } from '../config/process-role';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';

const INTERVAL_MS = 15 * 60_000;
const LEASE_MS = 30 * 60_000;

@Injectable()
export class ReconciliationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly reconciliation: ReconciliationService) {}

  onModuleInit() {
    if (!startsApi(processRole()) || process.env.NODE_ENV !== 'production' || !process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) return;
    const run = () => { void this.runOnce(); };
    this.timer = setInterval(run, INTERVAL_MS);
    this.timer.unref();
    run();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    const token = randomUUID();
    let acquired = false;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ token: string }>>(Prisma.sql`
        INSERT INTO "billing_reconciliation_lease" ("key", "token", "expires_at")
        VALUES ('production', ${token}::uuid, now() + (${LEASE_MS} * interval '1 millisecond'))
        ON CONFLICT ("key") DO UPDATE SET "token" = EXCLUDED."token", "expires_at" = EXCLUDED."expires_at"
        WHERE "billing_reconciliation_lease"."expires_at" < now()
        RETURNING "token"
      `);
      acquired = rows.length === 1;
      if (!acquired) return;
      const summary = await this.reconciliation.reconcilePendingBatch(20);
      if (summary.failed) this.logger.warn('Billing reconciliation had failures; later cycles will retry.');
    } catch {
      this.logger.warn('Billing reconciliation could not complete; later cycles will retry.');
    } finally {
      if (acquired) {
        try {
          await this.prisma.$executeRaw(Prisma.sql`DELETE FROM "billing_reconciliation_lease" WHERE "key" = 'production' AND "token" = ${token}::uuid`);
        } catch { this.logger.warn('Billing reconciliation lease will expire automatically.'); }
      }
      this.running = false;
    }
  }
}
