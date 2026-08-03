import { PerformanceCacheService } from './performance-cache.service';

const base = {
  tenantId: 'tenant-a',
  branchId: 'branch-a',
  userId: 'user-a',
  role: 'Admin',
  systemType: 'padrao',
  dashboardType: 'overview',
  timezone: 'UTC',
  filters: { preset: 'today', tags: ['a', 'b'], nested: { z: 1, a: 2 } },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('PerformanceCacheService RC-014', () => {
  it('canonicaliza filtros e isola tenant, filial, filtros, periodo e modo', () => {
    const cache = new PerformanceCacheService({ nodeEnv: 'test' });
    const key = cache.dashboardKey(base);
    expect(key).toBe(
      cache.dashboardKey({
        ...base,
        filters: {
          nested: { a: 2, z: 1 },
          tags: ['a', 'b'],
          preset: 'today',
        },
      }),
    );
    for (const changed of [
      { tenantId: 'tenant-b' },
      { branchId: 'branch-b' },
      { systemType: 'petshop' },
      { timezone: 'America/Sao_Paulo' },
      { filters: { preset: 'last7days' } },
    ])
      expect(key).not.toBe(cache.dashboardKey({ ...base, ...changed }));
  });

  it('faz miss, hit e expira por relogio monotonicamente injetado', async () => {
    let now = 0;
    const cache = new PerformanceCacheService({
      nodeEnv: 'test',
      ttlMs: 100,
      invalidationSlaMs: 100,
      now: () => now,
    });
    const factory = jest.fn().mockResolvedValue('value');
    expect(await cache.getOrSet('k', base, 100, factory)).toBe('value');
    expect(await cache.getOrSet('k', base, 100, factory)).toBe('value');
    expect(factory).toHaveBeenCalledTimes(1);
    now = 101;
    await cache.getOrSet('k', base, 100, factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it.each([2, 20, 100])(
    'coalesce %i chamadas na mesma geracao',
    async (count) => {
      const cache = new PerformanceCacheService({ nodeEnv: 'test' });
      const barrier = deferred<string>();
      const factory = jest.fn(() => barrier.promise);
      const calls = Array.from({ length: count }, () =>
        cache.getOrSet('k', base, 5000, factory),
      );
      await Promise.resolve();
      expect(factory).toHaveBeenCalledTimes(1);
      barrier.resolve('ok');
      await expect(Promise.all(calls)).resolves.toEqual(
        Array(count).fill('ok'),
      );
      expect(cache.inflightCount()).toBe(0);
    },
  );

  it('nao armazena erro e remove inflight', async () => {
    const cache = new PerformanceCacheService({ nodeEnv: 'test' });
    const factory = jest
      .fn()
      .mockRejectedValueOnce(new Error('failure'))
      .mockResolvedValue('ok');
    await expect(cache.getOrSet('k', base, 5000, factory)).rejects.toThrow(
      'failure',
    );
    expect(cache.inflightCount()).toBe(0);
    await expect(cache.getOrSet('k', base, 5000, factory)).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('generation fencing impede factory antiga de repor ou sobrescrever valor novo', async () => {
    const cache = new PerformanceCacheService({ nodeEnv: 'test' });
    const old = deferred<string>();
    const oldRead = cache.getOrSet('k', base, 5000, () => old.promise);
    await Promise.resolve();
    expect(cache.invalidateKey('k')).toBe(1);
    await expect(
      cache.getOrSet('k', base, 5000, async () => 'new'),
    ).resolves.toBe('new');
    old.resolve('old');
    await expect(oldRead).resolves.toBe('old');
    await expect(
      cache.getOrSet('k', base, 5000, async () => 'wrong'),
    ).resolves.toBe('new');
    expect(cache.generation('k')).toBe(1);
  });

  it('eventos duplicados e fora de ordem nunca reduzem geracao', () => {
    const cache = new PerformanceCacheService({ nodeEnv: 'test' });
    expect(cache.invalidateKey('k', 7)).toBe(7);
    expect(cache.invalidateKey('k', 7)).toBe(7);
    expect(cache.invalidateKey('k', 3)).toBe(7);
  });

  it('modo disabled preserva singleflight mas nao persiste', async () => {
    const cache = new PerformanceCacheService({
      mode: 'disabled',
      nodeEnv: 'test',
    });
    const factory = jest.fn().mockResolvedValue('ok');
    await cache.getOrSet('k', base, 5000, factory);
    await cache.getOrSet('k', base, 5000, factory);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(cache.entryCount()).toBe(0);
  });

  it('production sem declaracao single replica adota modo seguro', () => {
    expect(
      new PerformanceCacheService({ mode: 'local', nodeEnv: 'production' })
        .mode,
    ).toBe('disabled');
    expect(
      new PerformanceCacheService({
        mode: 'local',
        nodeEnv: 'production',
        singleReplica: true,
      }).mode,
    ).toBe('local');
  });

  it('rejeita configuracao invalida e TTL maior que SLA', () => {
    expect(
      () => new PerformanceCacheService({ ttlMs: 101, invalidationSlaMs: 100 }),
    ).toThrow(/must not exceed/);
  });

  it('limita memoria e limpa recursos no shutdown', async () => {
    const cache = new PerformanceCacheService({
      nodeEnv: 'test',
      maxEntries: 1,
    });
    await cache.getOrSet('one', base, 5000, async () => 1);
    await cache.getOrSet('two', base, 5000, async () => 2);
    expect(cache.entryCount()).toBe(1);
    cache.onModuleDestroy();
    expect(cache.entryCount()).toBe(0);
    expect(cache.inflightCount()).toBe(0);
  });
});
