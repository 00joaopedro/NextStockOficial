import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RailwayMetricsService } from '../dev/railway-metrics.service';
import { serverUsageLimitCents } from './server-usage-policy';

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ServerUsageService {
  private cache: { expiresAt: number; value: any } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly railway: RailwayMetricsService,
  ) {}

  async forTenant(tenantId: string, planSlug?: string | null) {
    const limitCents = serverUsageLimitCents(planSlug);
    if (!limitCents) return this.unavailable('PLAN_NOT_CONFIGURED');

    const provider = await this.providerUsage();
    const brlPerUsd = Number(process.env.RAILWAY_USAGE_BRL_PER_USD);
    if (!provider.available || provider.costUsd == null) {
      return this.unavailable('PROVIDER_USAGE_UNAVAILABLE');
    }
    if (!Number.isFinite(brlPerUsd) || brlPerUsd <= 0) {
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
        Math.round(provider.costUsd * brlPerUsd * 100 * (tenantWeight / totalWeight)),
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
    const value = await this.railway.getServiceUsage();
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
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
