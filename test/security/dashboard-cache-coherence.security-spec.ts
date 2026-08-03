import { PerformanceCacheService } from '../../src/performance/performance-cache.service';

const scope = { tenantId: 'tenant-a', branchId: 'branch-a' };

describe('RC-014 dashboard cache coherence across independent replicas', () => {
  it('production-safe replicas perform authoritative reads after commit within SLA', async () => {
    const replicaA = new PerformanceCacheService({
      nodeEnv: 'production',
      mode: 'local',
      invalidationSlaMs: 5000,
    });
    const replicaB = new PerformanceCacheService({
      nodeEnv: 'production',
      mode: 'local',
      invalidationSlaMs: 5000,
    });
    let committed = 1;
    const read = () => Promise.resolve(committed);
    expect(await replicaA.getOrSet('dashboard', scope, 5000, read)).toBe(1);
    expect(await replicaB.getOrSet('dashboard', scope, 5000, read)).toBe(1);
    const commitAt = performance.now();
    committed = 2; // deterministic stand-in for a successfully committed mutation
    replicaA.invalidateTenantBranch(scope.tenantId, scope.branchId);
    expect(await replicaB.getOrSet('dashboard', scope, 5000, read)).toBe(2);
    expect(performance.now() - commitAt).toBeLessThanOrEqual(
      replicaB.invalidationSlaMs,
    );
    expect(replicaA.entryCount()).toBe(0);
    expect(replicaB.entryCount()).toBe(0);
    replicaA.onModuleDestroy();
    replicaB.onModuleDestroy();
  });

  it.each([2, 20, 100])(
    'coalesces %i reads independently per replica',
    async (count) => {
      const cache = new PerformanceCacheService({ nodeEnv: 'test' });
      let calls = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reads = Array.from({ length: count }, () =>
        cache.getOrSet('k', scope, 5000, async () => {
          calls += 1;
          await barrier;
          return 1;
        }),
      );
      await Promise.resolve();
      expect(calls).toBe(1);
      release();
      await Promise.all(reads);
      expect(calls).toBe(1);
      cache.invalidateKey('k');
      await cache.getOrSet('k', scope, 5000, () => Promise.resolve(++calls));
      expect(calls).toBe(2);
      cache.onModuleDestroy();
    },
  );
});
