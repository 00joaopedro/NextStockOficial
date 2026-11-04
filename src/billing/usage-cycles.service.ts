import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RailwayMetricsService } from '../dev/railway-metrics.service';
import { RenderMetricsService } from '../dev/render-metrics.service';
import { processRole, startsApi } from '../config/process-role';

/** Monetary attribution is an estimate, never authorization to change a plan. */
@Injectable()
export class UsageCyclesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UsageCyclesService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly railway: RailwayMetricsService,
    private readonly render: RenderMetricsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'production' || !startsApi(processRole()))
      return;
    const run = () => {
      void this.collectBatch();
    };
    this.timer = setInterval(run, 5 * 60_000);
    this.timer.unref();
    run();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async collectBatch() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const invoices = await this.prisma.billingInvoice.findMany({
        where: {
          status: 'PAID',
          periodEndsAt: {
            lte: new Date(now.getTime() - 3_600_000),
            gte: new Date(now.getTime() - 62 * 86_400_000),
          },
          OR: [
            { usageCycle: { is: null } },
            {
              usageCycle: {
                is: {
                  status: 'UNAVAILABLE',
                  assessedAt: { lt: new Date(now.getTime() - 3_600_000) },
                },
              },
            },
          ],
        },
        orderBy: { periodEndsAt: 'desc' },
        take: 20,
      });
      for (const invoice of invoices) {
        try {
          await this.assess(invoice);
        } catch {
          this.logger.warn(
            'Usage cycle assessment unavailable; a later batch will retry.',
          );
        }
      }
    } catch {
      this.logger.warn(
        'Usage cycle batch unavailable; verify migrations and database connectivity.',
      );
    } finally {
      this.running = false;
    }
  }

  async lastCompletedForTenant(tenantId: string) {
    try {
      const subscription = await this.prisma.subscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!subscription)
        return {
          status: 'UNAVAILABLE',
          reason: 'SUBSCRIPTION_UNAVAILABLE',
          eligibleForDowngrade: false,
        };
      // Select the latest ended cycle first. Never fall back to an older cheaper cycle.
      const invoice = await this.prisma.billingInvoice.findFirst({
        where: {
          tenantId,
          subscriptionId: subscription.id,
          periodEndsAt: { lte: new Date() },
        },
        orderBy: { periodEndsAt: 'desc' },
      });
      if (!invoice)
        return {
          status: 'UNAVAILABLE',
          reason: 'COMPLETED_CYCLE_UNAVAILABLE',
          eligibleForDowngrade: false,
        };
      const record = await this.prisma.billingUsageCycle.findFirst({
        where: { tenantId, invoiceId: invoice.id },
      });
      if (invoice.status !== 'PAID' || !record)
        return {
          status: 'UNAVAILABLE',
          reason:
            invoice.status !== 'PAID' ? 'CYCLE_NOT_PAID' : 'CYCLE_NOT_ASSESSED',
          eligibleForDowngrade: false,
        };
      if (
        record.periodStart.getTime() !== invoice.periodStartedAt.getTime() ||
        record.periodEnd.getTime() !== invoice.periodEndsAt?.getTime()
      ) {
        return {
          status: 'UNAVAILABLE',
          reason: 'CYCLE_CHANGED',
          eligibleForDowngrade: false,
        };
      }
      return {
        status: record.status,
        reason: record.reason,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        costCents: record.costCents,
        currency: 'BRL',
        isEstimated: true,
        eligibleForDowngrade: false,
      };
    } catch {
      return {
        status: 'UNAVAILABLE',
        reason: 'CYCLE_STORAGE_UNAVAILABLE',
        eligibleForDowngrade: false,
      };
    }
  }

  async assess(invoice: {
    id: string;
    tenantId: string;
    status: string;
    periodStartedAt: Date;
    periodEndsAt: Date | null;
  }) {
    const start = invoice.periodStartedAt;
    const end = invoice.periodEndsAt;
    if (
      invoice.status !== 'PAID' ||
      !end ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end ||
      end.getTime() > Date.now() - 3_600_000
    )
      return;
    const existing = await this.prisma.billingUsageCycle.findFirst({
      where: { tenantId: invoice.tenantId, invoiceId: invoice.id },
    });
    if (existing?.status === 'ESTIMATED') return existing;
    const persist = async (
      reason: string | null,
      costCents: number | null,
      evidence: Record<string, string | number | boolean> = {},
    ) => {
      const data = {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        periodStart: start,
        periodEnd: end,
        status: reason ? 'UNAVAILABLE' : 'ESTIMATED',
        reason,
        costCents,
        evidence,
        assessedAt: new Date(),
      };
      if (existing)
        return this.prisma.billingUsageCycle.updateMany({
          where: {
            tenantId: invoice.tenantId,
            invoiceId: invoice.id,
            status: 'UNAVAILABLE',
          },
          data,
        });
      try {
        return await this.prisma.billingUsageCycle.create({ data });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    };
    const epoch = await this.prisma.usageMeteringState.findUnique({
      where: { key: 'cycle-v1' },
    });
    if (!epoch || start < epoch.startedAt)
      return persist('COLLECTION_STARTED_AFTER_CYCLE', null);
    if (end.getTime() - start.getTime() > 62 * 86_400_000)
      return persist('CYCLE_WINDOW_UNSUPPORTED', null);
    const gap = await this.prisma.usageCaptureGap.findFirst({
      where: { startedAt: { lt: end }, endedAt: { gt: start } },
      select: { id: true },
    });
    if (gap) return persist('USAGE_COLLECTION_INCOMPLETE', null);
    if (!this.railway.isUsageConfigured() || !this.render.isUsageConfigured())
      return persist('PROVIDER_CONFIGURATION_INCOMPLETE', null);
    const fx = Number(process.env.RAILWAY_USAGE_BRL_PER_USD);
    if (!Number.isFinite(fx) || fx <= 0)
      return persist('CURRENCY_RATE_UNAVAILABLE', null);
    const [railway, renderCost] = await Promise.all([
      this.railway.getServiceUsage({ start, end }),
      this.render.getRecordedCycleCost(start, end),
    ]);
    if (
      !railway.available ||
      railway.costUsd == null ||
      !Number.isFinite(railway.costUsd) ||
      railway.costUsd < 0 ||
      railway.periodStart !== start.toISOString() ||
      railway.periodEnd !== end.toISOString() ||
      renderCost == null ||
      !Number.isFinite(renderCost) ||
      renderCost < 0
    )
      return persist('PROVIDER_COVERAGE_INCOMPLETE', null);
    const rows = await this.prisma.userUsageEvent.groupBy({
      by: ['tenantId', 'provider'],
      where: { createdAt: { gte: start, lt: end } },
      _sum: { weight: true },
    });
    if (
      rows.some(
        (row) =>
          !row.tenantId ||
          !['railway', 'render'].includes(row.provider || '') ||
          !Number.isFinite(Number(row._sum.weight)) ||
          Number(row._sum.weight) < 0,
      )
    )
      return persist('USAGE_ORIGIN_INCOMPLETE', null);
    const costs = { railway: railway.costUsd * fx * 100, render: renderCost };
    let total = 0;
    for (const provider of ['railway', 'render'] as const) {
      const matching = rows.filter((row) => row.provider === provider);
      const denominator = matching.reduce(
        (sum, row) => sum + Number(row._sum.weight),
        0,
      );
      if (costs[provider] > 0 && denominator <= 0)
        return persist('PROVIDER_ACTIVITY_UNAVAILABLE', null);
      const numerator = matching
        .filter((row) => row.tenantId === invoice.tenantId)
        .reduce((sum, row) => sum + Number(row._sum.weight), 0);
      if (denominator > 0) total += (costs[provider] * numerator) / denominator;
    }
    const cents = Math.round(total);
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > 2_147_483_647)
      return persist('COST_OUT_OF_RANGE', null);
    return persist(null, cents, {
      algorithm: 'weighted_events_cycle_v1',
      brlPerUsd: fx,
      railwayCostUsd: railway.costUsd,
      renderCostCentsBrl: renderCost,
      capturedActivityOnly: true,
      eligibleForDowngrade: false,
    });
  }
}
