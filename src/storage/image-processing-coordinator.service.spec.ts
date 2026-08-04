import { ImageCapacityException } from './image-processing-coordinator.service';
import { ImageProcessingCoordinatorService } from './image-processing-coordinator.service';

describe('ImageProcessingCoordinatorService (MEM-016)', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.useRealTimers();
  });

  function coordinator(options: Record<string, string> = {}) {
    Object.assign(process.env, {
      IMAGE_PROCESSING_CONCURRENCY: '1',
      IMAGE_PROCESSING_MAX_QUEUE: '4',
      IMAGE_PROCESSING_QUEUE_TIMEOUT_MS: '15000',
      IMAGE_PROCESSING_PER_TENANT: '1',
      ...options,
    });
    return new ImageProcessingCoordinatorService();
  }

  function barrier() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => (release = resolve));
    return { promise, release };
  }

  it('enforces one active pipeline and releases all tenant state', async () => {
    const service = coordinator();
    const first = barrier();
    let secondStarted = false;
    const a = service.run('a', () => first.promise);
    const b = service.run('b', async () => {
      secondStarted = true;
    });
    await Promise.resolve();
    expect(service.snapshot()).toMatchObject({
      activePipelines: 1,
      queuedPipelines: 1,
    });
    expect(secondStarted).toBe(false);
    first.release();
    await Promise.all([a, b]);
    expect(service.snapshot()).toEqual({
      activePipelines: 0,
      queuedPipelines: 0,
      activeByTenant: {},
    });
  });

  it('never exceeds configured N across 100 deterministic jobs', async () => {
    const service = coordinator({
      IMAGE_PROCESSING_CONCURRENCY: '4',
      IMAGE_PROCESSING_PER_TENANT: '2',
      IMAGE_PROCESSING_MAX_QUEUE: '100',
    });
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 100 }, barrier);
    const jobs = gates.map((gate, index) =>
      service.run(`tenant-${index % 10}`, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
      }),
    );
    for (let index = 0; index < gates.length; index += 1) {
      gates[index].release();
      await Promise.resolve();
    }
    await Promise.all(jobs);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('limits each tenant without preventing another tenant from running', async () => {
    const service = coordinator({
      IMAGE_PROCESSING_CONCURRENCY: '2',
      IMAGE_PROCESSING_PER_TENANT: '1',
    });
    const a = barrier();
    const first = service.run('a', () => a.promise);
    const second = service.run('a', async () => undefined);
    const other = service.run('b', async () => undefined);
    await other;
    expect(service.snapshot().activeByTenant).toEqual({ a: 1 });
    a.release();
    await Promise.all([first, second]);
  });

  it('rejects a full queue without starting rejected work', async () => {
    const service = coordinator({ IMAGE_PROCESSING_MAX_QUEUE: '1' });
    const gate = barrier();
    const active = service.run('a', () => gate.promise);
    const queued = service.run('b', async () => undefined);
    let started = false;
    await expect(
      service.run('c', async () => {
        started = true;
      }),
    ).rejects.toBeInstanceOf(ImageCapacityException);
    expect(started).toBe(false);
    gate.release();
    await Promise.all([active, queued]);
  });

  it('times out queued work and cancels its timer/state', async () => {
    jest.useFakeTimers();
    const service = coordinator({ IMAGE_PROCESSING_QUEUE_TIMEOUT_MS: '100' });
    const gate = barrier();
    const active = service.run('a', () => gate.promise);
    const queued = service.run('b', async () => undefined);
    const rejection = expect(queued).rejects.toBeInstanceOf(
      ImageCapacityException,
    );
    await jest.advanceTimersByTimeAsync(100);
    await rejection;
    expect(service.snapshot().queuedPipelines).toBe(0);
    gate.release();
    await active;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not release a slot before failed work settles', async () => {
    const service = coordinator();
    const gate = barrier();
    const failed = service.run('a', async () => {
      await gate.promise;
      throw new Error('controlled');
    });
    await Promise.resolve();
    expect(service.snapshot().activePipelines).toBe(1);
    gate.release();
    await expect(failed).rejects.toThrow('controlled');
    expect(service.snapshot().activePipelines).toBe(0);
  });

  it('rejects new work during shutdown and waits for active work', async () => {
    const service = coordinator();
    const gate = barrier();
    const active = service.run('a', () => gate.promise);
    const shutdown = service.onApplicationShutdown();
    await expect(
      service.run('b', async () => undefined),
    ).rejects.toBeInstanceOf(ImageCapacityException);
    gate.release();
    await Promise.all([active, shutdown]);
  });

  it.each([
    ['IMAGE_PROCESSING_CONCURRENCY', '0'],
    ['IMAGE_PROCESSING_CONCURRENCY', '5'],
    ['IMAGE_PROCESSING_MAX_QUEUE', 'NaN'],
    ['IMAGE_PROCESSING_QUEUE_TIMEOUT_MS', '-1'],
  ])('fails early for invalid %s=%s', (name, value) => {
    expect(() => coordinator({ [name]: value })).toThrow(name);
  });
});
