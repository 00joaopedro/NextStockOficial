import { PerformanceCacheService } from './performance-cache.service';

describe('PerformanceCacheService', () => {
  it('isola dashboard por tenant, branch, usuario, papel, sistema e filtros', () => {
    const cache = new PerformanceCacheService();
    const base = {
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      userId: 'user-1',
      role: 'Admin',
      systemType: 'padrao',
      filters: { preset: 'today' },
    };

    expect(cache.dashboardKey(base)).not.toBe(
      cache.dashboardKey({ ...base, tenantId: 'tenant-2' }),
    );
    expect(cache.dashboardKey(base)).not.toBe(
      cache.dashboardKey({ ...base, branchId: 'branch-2' }),
    );
    expect(cache.dashboardKey(base)).not.toBe(
      cache.dashboardKey({ ...base, userId: 'user-2' }),
    );
    expect(cache.dashboardKey(base)).not.toBe(
      cache.dashboardKey({ ...base, role: 'Vendedor' }),
    );
    expect(cache.dashboardKey(base)).not.toBe(
      cache.dashboardKey({ ...base, systemType: 'petshop' }),
    );
    expect(cache.dashboardKey(base)).not.toBe(
      cache.dashboardKey({ ...base, filters: { preset: 'last7days' } }),
    );
  });

  it('reutiliza dentro do TTL e invalida somente tenant/branch alvo', async () => {
    const cache = new PerformanceCacheService();
    const factory = jest.fn().mockResolvedValue({ value: 1 });

    await cache.getOrSet(
      'key',
      { tenantId: 'tenant-1', branchId: 'branch-1' },
      5_000,
      factory,
    );
    await cache.getOrSet(
      'key',
      { tenantId: 'tenant-1', branchId: 'branch-1' },
      5_000,
      factory,
    );
    expect(factory).toHaveBeenCalledTimes(1);

    cache.invalidateTenantBranch('tenant-2', 'branch-1');
    await cache.getOrSet(
      'key',
      { tenantId: 'tenant-1', branchId: 'branch-1' },
      5_000,
      factory,
    );
    expect(factory).toHaveBeenCalledTimes(1);

    cache.invalidateTenantBranch('tenant-1', 'branch-1');
    await cache.getOrSet(
      'key',
      { tenantId: 'tenant-1', branchId: 'branch-1' },
      5_000,
      factory,
    );
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
