import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RailwayMetricsService } from '../dev/railway-metrics.service';
import { RenderMetricsService } from '../dev/render-metrics.service';
import { serverUsageLimitCents } from './server-usage-policy';

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ServerUsageService {
  private cache: { expiresAt: number; value: any } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly railway: RailwayMetricsService,
    private readonly render?: RenderMetricsService,
  ) {}

  async forTenant(tenantId: string, planSlug?: string | null) {
    const limitCents = serverUsageLimitCents(planSlug);
    if (!limitCents) return this.unavailable('PLAN_NOT_CONFIGURED');

    const provider = await this.providerUsage();
    const brlPerUsd = Number(process.env.RAILWAY_USAGE_BRL_PER_USD);
    if (!provider.available || provider.costCents == null) {
      return this.unavailable('PROVIDER_USAGE_UNAVAILABLE');
    }
    if (provider.railwayCostUsd != null && (!Number.isFinite(brlPerUsd) || brlPerUsd <= 0)) {
      return this.unavailable('CURRENCY_RATE_NOT_CONFIGURED');
    }

    const start = new Date(provider.periodStart!);
    const end = new Date(provider.periodEnd!);
    try {
      const grouped = await (this.prisma as any).userUsageEvent.groupBy({
        by: ['tenantId'],
        where: {
          tenantId: { not: null },
          createdAt: { gte: start, lte: end },
        },
        _sum: { weight: true },
      });
      const totalWeight = grouped.reduce(
        (total: number, row: any) => total + Math.max(0, Number(row?._sum?.weight || 0)),
        0,
      );
      const tenantWeight = grouped
        .filter((row: any) => row.tenantId === tenantId)
        .reduce((total: number, row: any) => total + Math.max(0, Number(row?._sum?.weight || 0)), 0);

      if (totalWeight <= 0) return this.unavailable('NO_TENANT_USAGE_RECORDED');

      const estimatedCostCents = Math.max(
        0,
        Math.round(provider.costCents * (tenantWeight / totalWeight)),
      );
      const actualPercent = Number(((estimatedCostCents / limitCents) * 100).toFixed(2));
      return {
        available: true,
        percentage: Math.min(100, actualPercent),
        actualPercentage: actualPercent,
        status: actualPercent >= 100 ? 'LIMIT_REACHED' : actualPercent >= 80 ? 'ATTENTION' : 'NORMAL',
        updatedAt: provider.updatedAt,
        periodEndsAt: provider.periodEnd,
      };
    } catch {
      return this.unavailable('TENANT_USAGE_UNAVAILABLE');
    }
  }

  private async providerUsage() {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    const railway = await this.railway.getServiceUsage();
    const periodStart = railway.periodStart || this.currentMonthStart();
    const periodEnd = railway.periodEnd || new Date().toISOString();
    const hasRenderConfiguration = Boolean(this.render?.isUsageConfigured());
    const render = hasRenderConfiguration
      ? await this.render!.getServiceUsage(periodStart, periodEnd)
      : null;
    // If a Render reserve is configured, we must obtain its instance-count
    // evidence. Returning an unavailable state is safer than understating a
    // hot standby during a Railway -> Render migration.
    const available = Boolean(railway.available || render?.available) &&
      (!hasRenderConfiguration || Boolean(render?.available));
    const brlPerUsd = Number(process.env.RAILWAY_USAGE_BRL_PER_USD);
    const railwayCostCents = railway.available && railway.costUsd != null && Number.isFinite(brlPerUsd) && brlPerUsd > 0
      ? Math.round(railway.costUsd * brlPerUsd * 100)
      : 0;
    const value = {
      available,
      costCents: available ? railwayCostCents + (render?.costCents || 0) : null,
      railwayCostUsd: railway.available ? railway.costUsd : null,
      periodStart,
      periodEnd,
      updatedAt: render?.updatedAt || railway.updatedAt,
    };
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  private currentMonthStart() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  }

  private unavailable(code: string) {
    return {
      available: false,
      code,
      percentage: null,
      actualPercentage: null,
      status: 'UNAVAILABLE',
      updatedAt: null,
      periodEndsAt: null,
    };
  }
}
