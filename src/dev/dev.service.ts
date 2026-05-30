import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevUsageCalculatorService } from './dev-usage-calculator.service';
import { RailwayMetricsService } from './railway-metrics.service';
import { ResourceSnapshotsService } from './resource-snapshots.service';
import { SupabaseMetricsService } from './supabase-metrics.service';
import type { DevPeriod } from './dto/dev-query.dto';
import type { DevUsageQueryDto } from './dto/dev-usage-query.dto';

type RecordUserUsageInput = {
  userId: string;
  email?: string | null;
  name?: string | null;
  systemType?: string | null;
  branchName?: string | null;
  eventType: string;
  page?: string | null;
};

function isMissingUserUsageTableError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; meta?: unknown };
  const message = candidate?.message ?? JSON.stringify(candidate?.meta ?? {});

  return (
    (candidate?.code === 'P2021' || candidate?.code === 'P2022') &&
    message.toLowerCase().includes('user_usage_events')
  );
}

@Injectable()
export class DevService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly railwayMetrics: RailwayMetricsService,
    private readonly supabaseMetrics: SupabaseMetricsService,
    @Optional() private readonly usageCalculator?: DevUsageCalculatorService,
    @Optional() private readonly resourceSnapshots?: ResourceSnapshotsService,
  ) {}

  calculatePeriod(period: DevPeriod = 'day') {
    const normalizedPeriod = this.normalizePeriod(period);
    const now = new Date();
    const start = new Date(now);

    if (normalizedPeriod === 'week') {
      // Padrao escolhido: ultimos 7 dias corridos ate agora.
      start.setDate(now.getDate() - 7);
    } else if (normalizedPeriod === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
    }

    return { period: normalizedPeriod, start, end: now };
  }

  async getOverview(period: DevPeriod = 'day') {
    const range = this.calculatePeriod(period);
    const [railway, supabase, usersSummary] = await Promise.all([
      this.safeRailwayOverview(),
      this.safeSupabaseOverview(),
      this.getUsersSummary(range.start, range.end),
    ]);
    const globalUsage = await this.getGlobalUsage(range.start, range.end, railway, supabase);

    return {
      period: range.period,
      periodStart: range.start.toISOString(),
      periodEnd: range.end.toISOString(),
      updatedAt: new Date().toISOString(),
      railway,
      supabase,
      usersSummary: {
        ...usersSummary,
        railwayGlobalUsage: globalUsage.railway,
        supabaseGlobalUsage: globalUsage.supabase,
        isEstimated: true,
      },
      isEstimated: true,
      estimationMethod: 'weighted_internal_events',
    };
  }

  async getUsersUsage(
    queryOrPeriod: DevUsageQueryDto | DevPeriod = 'day',
    legacySearch?: string,
  ) {
    const query =
      typeof queryOrPeriod === 'string'
        ? { period: queryOrPeriod, search: legacySearch }
        : queryOrPeriod;
    const range = this.calculatePeriod((query.period || 'day') as DevPeriod);
    const where: any = {
      createdAt: {
        gte: range.start,
        lte: range.end,
      },
    };

    const normalizedSearch = query.search?.trim();
    const profileWhere = normalizedSearch
      ? {
          OR: [
            { name: { contains: normalizedSearch, mode: 'insensitive' } },
            { email: { contains: normalizedSearch, mode: 'insensitive' } },
          ],
        }
      : {};

    if (normalizedSearch) {
      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { email: { contains: normalizedSearch, mode: 'insensitive' } },
      ];
    }

    const eventRows = (await this.safeUserUsageGroupBy({
      by: ['userId'],
      where: {
        createdAt: where.createdAt,
      },
      _count: { _all: true },
      _sum: { weight: true, dbReadCount: true, dbWriteCount: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    })) as any[];
    const eventsByUser = new Map(eventRows.map((event) => [event.userId, event]));
    const totalWeight = eventRows.reduce(
      (total, event) => total + (event._sum?.weight || event._count?._all || 0),
      0,
    );
    const totalEvents = eventRows.reduce(
      (total, event) => total + (event._count?._all || 0),
      0,
    );
    const [railway, supabase, rawProfiles, totalMatchingUsers] = await Promise.all([
      this.safeRailwayOverview(),
      this.safeSupabaseOverview(),
      this.findProfilesForUsage(profileWhere, query.page, query.pageSize),
      this.prisma.userProfile.count({ where: profileWhere as any }),
    ]);
    const profiles = rawProfiles as any[];
    const globalUsage = await this.getGlobalUsage(range.start, range.end, railway, supabase);
    const railwayCostCents = this.getPeriodCostCents('railway', range.start, range.end);
    const supabaseCostCents = this.getPeriodCostCents('supabase', range.start, range.end);

    return {
      period: range.period,
      periodStart: range.start.toISOString(),
      periodEnd: range.end.toISOString(),
      generatedAt: new Date().toISOString(),
      isEstimated: true,
      estimationMethod: 'weighted_internal_events',
      pagination: {
        page: query.page ?? null,
        pageSize: query.pageSize ?? null,
        total: totalMatchingUsers,
      },
      totals: {
        totalEvents,
        totalWeight,
        railwayGlobalUsage: globalUsage.railway,
        supabaseGlobalUsage: globalUsage.supabase,
      },
      users: profiles.map((profile) => {
        const event = eventsByUser.get(profile.id);
        const eventWeight = event?._sum?.weight || event?._count?._all || 0;
        const estimate = this.estimateForUser({
          userWeight: eventWeight,
          totalWeight,
          railwayTotalUnits: globalUsage.railway.units,
          supabaseTotalUnits: globalUsage.supabase.units,
          railwayCostCents,
          supabaseCostCents,
        });
        const membership = profile.memberships[0];
        const branchName = membership?.branch?.name || membership?.tenant?.name || '';

        return {
          id: profile.id,
          name: profile.name || profile.fullName || '',
          email: profile.email || '',
          systemType: profile.systemType || membership?.tenant?.systemType || '',
          branchName,
          tenantName: membership?.tenant?.name || '',
          accessCount: event?._count?._all || 0,
          eventWeight,
          dbReadCount: event?._sum?.dbReadCount || 0,
          dbWriteCount: event?._sum?.dbWriteCount || 0,
          lastAccessAt: event?._max?.createdAt?.toISOString?.() || null,
          serverUsage: estimate.railway,
          databaseUsage: estimate.supabase,
          estimatedCostCents: estimate.estimatedCostCents,
          usageSharePercent: estimate.sharePercent,
          period: range.period,
          isEstimated: true,
        };
      }),
    };
  }

  async getHealth() {
    return {
      ok: true,
      railwayConfigured: this.railwayMetrics.isConfigured(),
      supabaseConfigured: this.supabaseMetrics.isConfigured(),
      databaseConnected: await this.supabaseMetrics.isDatabaseConnected(),
    };
  }

  async recordUserUsage(input: RecordUserUsageInput) {
    try {
      return await (this.prisma as any).userUsageEvent.create({
        data: {
          userId: input.userId,
          email: input.email,
          name: input.name,
          systemType: input.systemType,
          branchName: input.branchName,
          eventType: input.eventType,
          page: input.page,
        },
      });
    } catch (error) {
      if (isMissingUserUsageTableError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async getUsersSummary(start: Date, end: Date) {
    const totalUsers = await this.prisma.userProfile.count();

    try {
      const [totalAccesses, activeUserRows, weightRow] = await Promise.all([
        (this.prisma as any).userUsageEvent.count({
          where: { createdAt: { gte: start, lte: end } },
        }),
        (this.prisma as any).userUsageEvent.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: start, lte: end } },
        }),
        (this.prisma as any).userUsageEvent.aggregate({
          where: { createdAt: { gte: start, lte: end } },
          _sum: { weight: true },
        }),
      ]);

      return {
        totalUsers,
        activeUsers: activeUserRows.length,
        totalEvents: totalAccesses,
        totalAccesses,
        totalWeight: weightRow?._sum?.weight || totalAccesses,
      };
    } catch (error) {
      if (!isMissingUserUsageTableError(error)) {
        throw error;
      }

      return {
        totalUsers,
        activeUsers: 0,
        totalEvents: 0,
        totalAccesses: 0,
        totalWeight: 0,
      };
    }
  }

  private async safeUserUsageGroupBy(args: any) {
    try {
      return await (this.prisma as any).userUsageEvent.groupBy(args);
    } catch (error) {
      if (isMissingUserUsageTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  private normalizePeriod(period: DevPeriod): 'day' | 'week' | 'month' {
    if (period === 'week' || period === 'weekly') {
      return 'week';
    }

    if (period === 'month' || period === 'monthly') {
      return 'month';
    }

    return 'day';
  }

  private async findProfilesForUsage(where: any, page?: number, pageSize?: number) {
    const pagination: any =
      page && pageSize
        ? {
            skip: (page - 1) * pageSize,
            take: pageSize,
          }
        : {};

    return this.prisma.userProfile.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        fullName: true,
        systemType: true,
        memberships: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: {
            tenant: {
              select: {
                id: true,
                name: true,
                systemType: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      ...pagination,
    } as any);
  }

  private estimateForUser(input: {
    userWeight: number;
    totalWeight: number;
    railwayTotalUnits: number;
    supabaseTotalUnits: number;
    railwayCostCents?: number | null;
    supabaseCostCents?: number | null;
  }) {
    if (this.usageCalculator) {
      return this.usageCalculator.estimateForUser(input);
    }

    const share = input.totalWeight > 0 ? input.userWeight / input.totalWeight : 0;

    return {
      share,
      sharePercent: Number((share * 100).toFixed(2)),
      railway: {
        units: Number((input.railwayTotalUnits * share).toFixed(2)),
        costCents:
          input.railwayCostCents == null ? null : Math.round(input.railwayCostCents * share),
      },
      supabase: {
        units: Number((input.supabaseTotalUnits * share).toFixed(2)),
        costCents:
          input.supabaseCostCents == null ? null : Math.round(input.supabaseCostCents * share),
      },
      estimatedCostCents: null,
    };
  }

  private async getGlobalUsage(start: Date, end: Date, railway: any, supabase: any) {
    const railwayUnits = this.usageCalculator?.getRailwayUnits(railway) ?? 0;
    const supabaseUnits = this.usageCalculator?.getSupabaseUnits(supabase) ?? 0;

    if (!this.resourceSnapshots) {
      return {
        railway: { units: railwayUnits, unit: 'weighted_units', cached: false },
        supabase: { units: supabaseUnits, unit: 'weighted_units', cached: false },
      };
    }

    const [railwaySnapshot, supabaseSnapshot] = await Promise.all([
      this.resourceSnapshots.getOrCreate({
        provider: 'railway',
        metricName: 'global_weighted_usage',
        periodStart: start,
        periodEnd: end,
        unit: 'weighted_units',
        source: 'railway_api',
        load: async () => ({ value: railwayUnits, metadata: railway }),
      }),
      this.resourceSnapshots.getOrCreate({
        provider: 'supabase',
        metricName: 'global_weighted_usage',
        periodStart: start,
        periodEnd: end,
        unit: 'weighted_units',
        source: 'supabase_management_api_prisma',
        load: async () => ({ value: supabaseUnits, metadata: supabase }),
      }),
    ]);

    return {
      railway: {
        units: railwaySnapshot.value,
        unit: 'weighted_units',
        cached: railwaySnapshot.cached,
      },
      supabase: {
        units: supabaseSnapshot.value,
        unit: 'weighted_units',
        cached: supabaseSnapshot.cached,
      },
    };
  }

  private getPeriodCostCents(provider: 'railway' | 'supabase', start: Date, end: Date) {
    return this.usageCalculator?.getEstimatedPeriodCostCents(provider, start, end) ?? null;
  }

  private async safeRailwayOverview() {
    try {
      return await this.railwayMetrics.getOverview();
    } catch {
      return {
        status: 'unavailable',
        projectId: process.env.RAILWAY_PROJECT_ID || '',
        serviceId: process.env.RAILWAY_SERVICE_ID || '',
        cpu: null,
        memory: null,
        network: null,
        deployments: [],
        message:
          'Metrica nao disponivel com as permissoes/configuracao atual.',
      };
    }
  }

  private async safeSupabaseOverview() {
    try {
      return await this.supabaseMetrics.getOverview();
    } catch {
      return {
        status: 'unavailable',
        projectRef: process.env.SUPABASE_PROJECT_REF || '',
        databaseSize: null,
        activeConnections: null,
        storageUsed: null,
        message:
          'Metrica nao disponivel com as permissoes/configuracao atual.',
      };
    }
  }
}
