import { Injectable } from '@nestjs/common';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  tenantId: string;
  branchId: string;
};

export type DashboardCacheKey = {
  tenantId: string;
  branchId: string;
  userId: string;
  role: string;
  systemType: string;
  filters: Record<string, unknown>;
};

@Injectable()
export class PerformanceCacheService {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries = this.envInt('PERFORMANCE_CACHE_MAX_ENTRIES', 500);

  dashboardKey(input: DashboardCacheKey) {
    return `dashboard:${JSON.stringify({
      tenantId: input.tenantId,
      branchId: input.branchId,
      userId: input.userId,
      role: input.role,
      systemType: input.systemType,
      filters: input.filters,
    })}`;
  }

  async getOrSet<T>(
    key: string,
    scope: { tenantId: string; branchId: string },
    ttlMs: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.entries.delete(key);

    const value = await factory();
    this.evictExpired();
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    return value;
  }

  invalidateTenantBranch(tenantId: string, branchId: string) {
    for (const [key, entry] of this.entries) {
      if (entry.tenantId === tenantId && entry.branchId === branchId) {
        this.entries.delete(key);
      }
    }
  }

  private evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  private envInt(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}
