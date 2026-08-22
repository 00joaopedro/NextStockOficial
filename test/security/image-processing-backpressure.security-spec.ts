import { ImageProcessingCoordinatorService } from '../../src/storage/image-processing-coordinator.service';

describe('MEM-016 upload processing backpressure integration', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it.each([2, 20, 100])(
    'bounds active pipelines and queue for %i simultaneous uploads',
    async (count) => {
      Object.assign(process.env, {
        IMAGE_PROCESSING_CONCURRENCY: '1',
        IMAGE_PROCESSING_PER_TENANT: '1',
        IMAGE_PROCESSING_MAX_QUEUE: '4',
        IMAGE_PROCESSING_QUEUE_TIMEOUT_MS: '15000',
      });
      const coordinator = new ImageProcessingCoordinatorService();
      let unblock!: () => void;
      const barrier = new Promise<void>((resolve) => (unblock = resolve));
      let peakActive = 0;
      let peakQueue = 0;
      let started = 0;

      const uploads = Array.from({ length: count }, (_, index) =>
        coordinator
          .run(`tenant-${index % 5}`, async () => {
            started += 1;
            peakActive = Math.max(
              peakActive,
              coordinator.snapshot().activePipelines,
            );
            if (started === 1) await barrier;
          })
          .then(
            () => 'processed' as const,
            () => 'capacity-rejected' as const,
          ),
      );
      peakQueue = Math.max(peakQueue, coordinator.snapshot().queuedPipelines);
      expect(peakQueue).toBeLessThanOrEqual(4);
      unblock();
      const results = await Promise.all(uploads);

      expect(peakActive).toBe(1);
      expect(started).toBeLessThanOrEqual(5);
      expect(results).toHaveLength(count);
      if (count > 5) expect(results).toContain('capacity-rejected');
      expect(coordinator.snapshot()).toEqual({
        activePipelines: 0,
        queuedPipelines: 0,
        activeByTenant: {},
      });
    },
  );
});
