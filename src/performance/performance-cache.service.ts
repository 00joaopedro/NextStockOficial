import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
  tenantId: string;
  branchId: string;
  generation: number;
};

export type DashboardCacheKey = {
  tenantId: string;
  branchId: string;
  userId?: string;
  role?: string;
  systemType: string;
  dashboardType?: string;
  timezone?: string;
  filters: Record<string, unknown>;
};

export type DashboardCacheOptions = {
  mode?: 'auto' | 'local' | 'disabled';
  nodeEnv?: string;
  singleReplica?: boolean;
  ttlMs?: number;
  invalidationSlaMs?: number;
  maxEntries?: number;
  now?: () => number;
};

/**
 * Process-local dashboard cache. There is deliberately no pretend distributed
 * invalidation: deployed runtimes default to disabled unless the operator makes
 * the single-replica topology explicit. Singleflight remains active in all modes.
 */
@Injectable()
export class PerformanceCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(PerformanceCacheService.name);
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly inflightScopes = new Map<
    string,
    { key: string; tenantId: string; branchId: string }
  >();
  private readonly generations = new Map<string, number>();
  private readonly now: () => number;
  readonly mode: 'local' | 'disabled';
  readonly ttlMs: number;
  readonly invalidationSlaMs: number;
  private readonly maxEntries: number;

  constructor(
    @Optional()
    @Inject('DASHBOARD_CACHE_OPTIONS')
    options: DashboardCacheOptions = {},
  ) {
    const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
    const requested = options.mode ?? this.envMode();
    const singleReplica =
      options.singleReplica ??
      process.env.DASHBOARD_CACHE_SINGLE_REPLICA === 'true';
    this.mode =
      requested === 'disabled' ||
      ((nodeEnv === 'production' || process.env.APP_ENV === 'staging') &&
        !singleReplica)
        ? 'disabled'
        : 'local';
    this.invalidationSlaMs =
      options.invalidationSlaMs ??
      this.envInt('DASHBOARD_CACHE_INVALIDATION_SLA_MS', 5_000, 100, 30_000);
    this.ttlMs =
      options.ttlMs ??
      this.envInt('DASHBOARD_CACHE_TTL_MS', 5_000, 100, 30_000);
    if (this.ttlMs > this.invalidationSlaMs) {
      throw new Error(
        'DASHBOARD_CACHE_TTL_MS must not exceed DASHBOARD_CACHE_INVALIDATION_SLA_MS',
      );
    }
    this.maxEntries =
      options.maxEntries ??
      this.envInt('DASHBOARD_CACHE_MAX_ENTRIES', 500, 1, 10_000);
    this.now = options.now ?? (() => performance.now());
    if (this.mode === 'disabled') {
      this.logger.log(
        'Dashboard materialized cache disabled for replica safety',
      );
    }
  }

  dashboardKey(input: DashboardCacheKey) {
    return `dashboard:v2:${stableJson({
      tenantId: input.tenantId,
      branchId: input.branchId || 'all-branches',
      userId: input.userId ?? null,
      role: input.role?.toLowerCase() ?? null,
      systemType: input.systemType.toLowerCase(),
      dashboardType: input.dashboardType ?? 'overview',
      timezone: input.timezone ?? process.env.TZ ?? 'America/Sao_Paulo',
      filters: input.filters,
    })}`;
  }

  async getOrSet<T>(
    key: string,
    scope: { tenantId: string; branchId: string },
    ttlMs: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const now = this.now();
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (this.mode === 'local' && cached && cached.expiresAt > now)
      return cached.value;
    if (cached) this.entries.delete(key);

    const generation = this.generation(key);
    const flightKey = `${key}\u0000${generation}`;
    const existing = this.inflight.get(flightKey) as Promise<T> | undefined;
    if (existing) return existing;

    const flight = (async () => {
      const value = await factory();
      if (this.mode === 'local' && this.generation(key) === generation) {
        this.evictExpired();
        while (this.entries.size >= this.maxEntries) {
          const oldest = this.entries.keys().next().value as string | undefined;
          if (!oldest) break;
          this.entries.delete(oldest);
        }
        const createdAt = this.now();
        this.entries.set(key, {
          value,
          expiresAt: createdAt + Math.min(ttlMs, this.ttlMs),
          createdAt,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          generation,
        });
      }
      return value;
    })();
    this.inflight.set(flightKey, flight);
    this.inflightScopes.set(flightKey, { key, ...scope });
    try {
      return await flight;
    } finally {
      if (this.inflight.get(flightKey) === flight)
        this.inflight.delete(flightKey);
      this.inflightScopes.delete(flightKey);
    }
  }

  invalidateTenantBranch(tenantId: string, branchId: string) {
    const keys = new Set<string>();
    for (const [key, entry] of this.entries) {
      if (entry.tenantId === tenantId && entry.branchId === branchId)
        keys.add(key);
    }
    // Include in-flight keys, which may not yet have a materialized entry.
    for (const flight of this.inflightScopes.values()) {
      if (flight.tenantId === tenantId && flight.branchId === branchId) {
        keys.add(flight.key);
      }
    }
    for (const key of keys) this.invalidateKey(key);
  }

  invalidateKey(key: string, remoteGeneration?: number) {
    const current = this.generation(key);
    const next =
      remoteGeneration === undefined
        ? current + 1
        : Math.max(current, remoteGeneration);
    this.generations.set(key, next);
    this.entries.delete(key);
    return next;
  }

  generation(key: string) {
    return this.generations.get(key) ?? 0;
  }
  entryCount() {
    return this.entries.size;
  }
  inflightCount() {
    return this.inflight.size;
  }

  onModuleDestroy() {
    this.entries.clear();
    this.inflight.clear();
    this.inflightScopes.clear();
    this.generations.clear();
  }

  private evictExpired() {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  private envMode(): 'auto' | 'local' | 'disabled' {
    const value = process.env.DASHBOARD_CACHE_MODE ?? 'auto';
    if (!['auto', 'local', 'disabled'].includes(value)) {
      throw new Error('DASHBOARD_CACHE_MODE must be auto, local or disabled');
    }
    return value as 'auto' | 'local' | 'disabled';
  }

  private envInt(name: string, fallback: number, min: number, max: number) {
    if (process.env[name] === undefined) return fallback;
    const value = Number(process.env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
