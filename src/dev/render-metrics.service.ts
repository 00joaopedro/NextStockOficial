import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type RenderServiceUsage = {
  available: boolean;
  costCents: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  updatedAt: string;
  serviceIds: string[];
};

type MetricPoint = { timestamp?: string; value?: number };
type MetricSeries = { values?: MetricPoint[] };

/**
 * Render exposes resource metrics, not a billing ledger. Cost is therefore an
 * estimate based on the configured hourly price of each reserved service. A
 * stopped cold standby has zero instances and contributes zero cost.
 */
@Injectable()
export class RenderMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenderMetricsService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private collecting: Promise<void> | undefined;
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  onModuleInit() {
    if (!this.prisma) return;
    const run = () => { void this.collectRecent().catch(() => this.logger.warn('Render metrics collection failed.')); };
    run();
    this.timer = setInterval(run, 30 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async collectRecent(): Promise<void> {
    if (!this.prisma || !this.isUsageConfigured()) return;
    if (this.collecting) return this.collecting;
    this.collecting = this.collectRecentOnce().finally(() => { this.collecting = undefined; });
    return this.collecting;
  }

  private async collectRecentOnce(): Promise<void> {
    const hour = 3_600_000;
    const end = Math.floor(Date.now() / hour) * hour;
    const start = end - 6 * 24 * hour;
    const rates = this.hourlyRateByService();
    for (const serviceId of this.serviceIds()) {
      if (!Number.isFinite(rates[serviceId]) || rates[serviceId] < 0) throw new Error('rate');
      const query = new URLSearchParams({ startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), resolutionSeconds: '3600', resource: serviceId });
      const response = await fetch(`${this.apiUrl}?${query}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${process.env.RENDER_API_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      const series = await response.json().catch(() => null) as MetricSeries[] | null;
      if (!response.ok || !Array.isArray(series)) throw new Error('metrics');
      const samples = new Map<number, number>();
      for (const item of series) for (const point of item.values || []) {
        const time = new Date(point.timestamp || '').getTime();
        const count = point.value;
        if (!Number.isFinite(time) || time < start || time >= end || time % hour !== 0 ||
            typeof count !== 'number' || !Number.isFinite(count) || count < 0) continue;
        samples.set(time, Math.max(samples.get(time) ?? 0, count));
      }
      if (!samples.size) throw new Error('metrics_empty');
      await (this.prisma as any).providerUsageSample.createMany({
        data: [...samples].map(([time, instanceCount]) => ({ provider: 'render', serviceId, hourStart: new Date(time), instanceCount })),
        skipDuplicates: true,
      });
    }
  }

  private async durableCost(startIso: string, endIso: string): Promise<number | null> {
    const hour = 3_600_000;
    const start = new Date(startIso).getTime();
    const end = Math.min(new Date(endIso).getTime(), Math.floor(Date.now() / hour) * hour);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 62 * 24 * hour) return null;
    const first = Math.floor(start / hour) * hour;
    const ids = this.serviceIds();
    const rates = this.hourlyRateByService();
    const rows = await (this.prisma as any).providerUsageSample.findMany({
      where: { provider: 'render', serviceId: { in: ids }, hourStart: { gte: new Date(first), lt: new Date(end) } },
    });
    const values = new Map(rows.map((row: any) => [`${row.serviceId}:${new Date(row.hourStart).getTime()}`, Number(row.instanceCount)]));
    let total = 0;
    for (const id of ids) {
      const rate = rates[id];
      if (!Number.isFinite(rate) || rate < 0) return null;
      for (let time = first; time < end; time += hour) {
        const count = values.get(`${id}:${time}`);
        if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
        const overlap = Math.min(end, time + hour) - Math.max(start, time);
        total += count * rate * overlap / hour;
      }
    }
    return Math.round(total);
  }

  private readonly apiUrl = 'https://api.render.com/v1/metrics/instance-count';

  isUsageConfigured() {
    return Boolean(
      process.env.RENDER_API_KEY?.trim() &&
        this.serviceIds().length &&
        Object.keys(this.hourlyRateByService()).length,
    );
  }

  hasUsageConfigurationIntent() {
    return Boolean(
      process.env.RENDER_API_KEY?.trim() ||
        process.env.RENDER_USAGE_SERVICE_IDS?.trim() ||
        process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE?.trim(),
    );
  }

  async getServiceUsage(
    periodStart: string,
    periodEnd: string,
  ): Promise<RenderServiceUsage> {
    const unavailable = (): RenderServiceUsage => ({
      available: false,
      costCents: null,
      periodStart,
      periodEnd,
      updatedAt: new Date().toISOString(),
      serviceIds: this.serviceIds(),
    });
    if (!this.isUsageConfigured()) return unavailable();

    if (this.prisma) {
      try {
        void this.collectRecent().catch(() => this.logger.warn('Render metrics collection failed.'));
        const costCents = await this.durableCost(periodStart, periodEnd);
        if (costCents == null) return unavailable();
        return { available: true, costCents, periodStart, periodEnd,
          updatedAt: new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString(), serviceIds: this.serviceIds() };
      } catch { return unavailable(); }
    }

    try {
      const rates = this.hourlyRateByService();
      const costs = await Promise.all(
        this.serviceIds().map(async (serviceId) => {
          const rate = rates[serviceId];
          if (!Number.isFinite(rate) || rate < 0) throw new Error('rate');
          const query = new URLSearchParams({
            startTime: periodStart,
            endTime: periodEnd,
            resolutionSeconds: '3600',
            resource: serviceId,
          });
          const response = await fetch(`${this.apiUrl}?${query}`, {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
            },
          });
          const body = (await response.json().catch(() => null)) as unknown;
          if (!response.ok || !Array.isArray(body)) throw new Error('metrics');
          return this.costForService(
            body as MetricSeries[],
            rate,
            periodStart,
            periodEnd,
          );
        }),
      );
      return {
        available: true,
        costCents: Math.round(costs.reduce((total, cost) => total + cost, 0)),
        periodStart,
        periodEnd,
        updatedAt: new Date().toISOString(),
        serviceIds: this.serviceIds(),
      };
    } catch {
      return unavailable();
    }
  }

  private costForService(
    series: MetricSeries[],
    centsPerHour: number,
    periodStart: string,
    periodEnd: string,
  ) {
    // A service can return more than one series (for example per replica).
    // `instance-count` is already an aggregate; taking one maximum per time
    // bucket avoids charging the same replica twice when labels overlap.
    const byTimestamp = new Map<string, number>();
    for (const item of series) {
      for (const point of item.values || []) {
        if (!point.timestamp || !Number.isFinite(point.value)) continue;
        byTimestamp.set(
          point.timestamp,
          Math.max(byTimestamp.get(point.timestamp) || 0, Number(point.value)),
        );
      }
    }
    if (!this.hasFullCoverage(byTimestamp, periodStart, periodEnd)) {
      throw new Error('incomplete_metrics');
    }
    return [...byTimestamp.values()].reduce(
      (total, instances) => total + instances * centsPerHour,
      0,
    );
  }

  private hasFullCoverage(
    byTimestamp: Map<string, number>,
    periodStart: string,
    periodEnd: string,
  ) {
    const start = new Date(periodStart).getTime();
    const end = Math.min(new Date(periodEnd).getTime(), Date.now());
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      return false;
    const timestamps = [...byTimestamp.keys()]
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const expectedBuckets = Math.max(1, Math.ceil((end - start) / 3_600_000));
    const toleranceMs = 3_600_000;
    return Boolean(
      timestamps.length >= expectedBuckets &&
        timestamps[0] <= start + toleranceMs &&
        timestamps[timestamps.length - 1] >= end - toleranceMs,
    );
  }

  private serviceIds() {
    return [
      ...new Set(
        (process.env.RENDER_USAGE_SERVICE_IDS || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
  }

  private hourlyRateByService(): Record<string, number> {
    try {
      const parsed = JSON.parse(
        process.env.RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE || '{}',
      ) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed)
          .filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
          .map(([serviceId, value]) => [serviceId, Number(value)]),
      );
    } catch {
      return {};
    }
  }
}
