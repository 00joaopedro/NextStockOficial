import { Injectable } from '@nestjs/common';

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
export class RenderMetricsService {
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
          .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0)
          .map(([serviceId, value]) => [serviceId, Number(value)]),
      );
    } catch {
      return {};
    }
  }
}
