import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RailwayMetricsService } from './railway-metrics.service';
import { SupabaseMetricsService } from './supabase-metrics.service';
import type { DevPeriod } from './dto/dev-query.dto';

type RecordUserUsageInput = {
  userId: string;
  email?: string | null;
  name?: string | null;
  systemType?: string | null;
  branchName?: string | null;
  eventType: string;
  page?: string | null;
};

@Injectable()
export class DevService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly railwayMetrics: RailwayMetricsService,
    private readonly supabaseMetrics: SupabaseMetricsService,
  ) {}

  calculatePeriod(period: DevPeriod = 'today') {
    const now = new Date();
    const start = new Date(now);

    if (period === 'weekly') {
      // Padrao escolhido: ultimos 7 dias corridos ate agora.
      start.setDate(now.getDate() - 7);
    } else if (period === 'monthly') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
    }

    return { period, start, end: now };
  }

  async getOverview(period: DevPeriod = 'today') {
    const range = this.calculatePeriod(period);
    const [railway, supabase, usersSummary] = await Promise.all([
      this.safeRailwayOverview(),
      this.safeSupabaseOverview(),
      this.getUsersSummary(range.start, range.end),
    ]);

    return {
      period,
      updatedAt: new Date().toISOString(),
      railway,
      supabase,
      usersSummary,
    };
  }

  async getUsersUsage(period: DevPeriod = 'today', search?: string) {
    const range = this.calculatePeriod(period);
    const where: any = {
      createdAt: {
        gte: range.start,
        lte: range.end,
      },
    };

    const normalizedSearch = search?.trim();

    if (normalizedSearch) {
      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { email: { contains: normalizedSearch, mode: 'insensitive' } },
      ];
    }

    const events = await (this.prisma as any).userUsageEvent.groupBy({
      by: ['userId', 'email', 'name', 'systemType', 'branchName'],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });

    return {
      period,
      users: events.map((event) => ({
        id: event.userId,
        name: event.name || '',
        email: event.email || '',
        systemType: event.systemType || '',
        branchName: event.branchName || '',
        accessCount: event._count?._all || 0,
        lastAccessAt: event._max?.createdAt?.toISOString?.() || '',
        serverUsage: null,
        databaseUsage: null,
      })),
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
    return (this.prisma as any).userUsageEvent.create({
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
  }

  private async getUsersSummary(start: Date, end: Date) {
    const [totalUsers, totalAccesses, activeUserRows] = await Promise.all([
      this.prisma.userProfile.count(),
      (this.prisma as any).userUsageEvent.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      (this.prisma as any).userUsageEvent.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: start, lte: end } },
      }),
    ]);

    return {
      totalUsers,
      activeUsers: activeUserRows.length,
      totalAccesses,
    };
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
