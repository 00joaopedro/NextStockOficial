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
      const gap = await (this.prisma as any).usageCaptureGap.findFirst({
        where: { startedAt: { lt: end }, endedAt: { gte: start } }, select: { id: true },
      });
      if (gap) return this.unavailable('USAGE_COLLECTION_INCOMPLETE');
      const grouped = await (this.prisma as any).userUsageEvent.groupBy({
        by: ['tenantId', 'provider'],
        where: { createdAt: { gte: start, lt: end } },
        _sum: { weight: true },
      });
      if (grouped.some((row: any) => !row.tenantId || !['railway', 'render'].includes(row.provider))) {
        return this.unavailable('USAGE_ORIGIN_INCOMPLETE');
      }
      if (grouped.some((row: any) => row.provider === 'railway') && !provider.railwayConfigured ||
          grouped.some((row: any) => row.provider === 'render') && !provider.renderConfigured) {
        return this.unavailable('PROVIDER_USAGE_UNAVAILABLE');
      }
      let estimatedCostCents = 0;
      for (const name of ['railway', 'render'] as const) {
        const cost = provider.costByProvider[name];
        if (cost == null || !Number.isFinite(cost) || cost < 0) return this.unavailable('PROVIDER_USAGE_UNAVAILABLE');
        if (cost === 0) continue;
        const rows = grouped.filter((row: any) => row.provider === name);
        const total = rows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row._sum?.weight || 0)), 0);
        if (total <= 0) return this.unavailable('NO_PROVIDER_USAGE_RECORDED');
        const tenant = rows.filter((row: any) => row.tenantId === tenantId)
          .reduce((sum: number, row: any) => sum + Math.max(0, Number(row._sum?.weight || 0)), 0);
        estimatedCostCents += cost * tenant / total;
      }
      estimatedCostCents = Math.max(0, Math.round(estimatedCostCents));
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
    const railwayConfigured = this.railway.isUsageConfigured();
    const hasRenderConfiguration = Boolean(this.render?.hasUsageConfigurationIntent());
    const render = hasRenderConfiguration
      ? await this.render!.getServiceUsage(periodStart, periodEnd)
      : null;
    // If a Render reserve is configured, we must obtain its instance-count
    // evidence. Returning an unavailable state is safer than understating a
    // hot standby during a Railway -> Render migration.
    const available =
      (!railwayConfigured || railway.available) &&
      (!hasRenderConfiguration || Boolean(render?.available)) &&
      Boolean(railway.available || render?.available);
    const brlPerUsd = Number(process.env.RAILWAY_USAGE_BRL_PER_USD);
    const railwayCostCents = railway.available && railway.costUsd != null && Number.isFinite(brlPerUsd) && brlPerUsd > 0
      ? Math.round(railway.costUsd * brlPerUsd * 100)
      : 0;
    const value = {
      available,
      railwayConfigured,
      renderConfigured: hasRenderConfiguration,
      costCents: available ? railwayCostCents + (render?.costCents ?? 0) : null,
      costByProvider: {
        railway: railwayConfigured ? (railway.available ? railwayCostCents : null) : 0,
        render: hasRenderConfiguration ? (render?.available ? render.costCents : null) : 0,
      },
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
