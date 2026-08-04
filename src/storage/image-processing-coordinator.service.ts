import {
  HttpException,
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';

type Waiter = {
  tenantId: string;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export type ImageProcessingSnapshot = {
  activePipelines: number;
  queuedPipelines: number;
  activeByTenant: Record<string, number>;
};

export class ImageCapacityException extends HttpException {
  constructor(message: string, retryAfterSeconds: number) {
    super({ statusCode: 503, error: 'Service Unavailable', message }, 503);
    Object.defineProperty(this, 'retryAfterSeconds', {
      enumerable: true,
      value: retryAfterSeconds,
    });
  }
}

/** Process-local FIFO semaphore. CPU/libvips capacity is deliberately per replica. */
@Injectable()
export class ImageProcessingCoordinatorService implements OnApplicationShutdown {
  private readonly concurrency: number;
  private readonly maxQueue: number;
  private readonly queueTimeoutMs: number;
  private readonly perTenant: number;
  private readonly queue: Waiter[] = [];
  private readonly activeByTenant = new Map<string, number>();
  private active = 0;
  private shuttingDown = false;
  private idleWaiters: Array<() => void> = [];

  constructor() {
    this.concurrency = this.setting('IMAGE_PROCESSING_CONCURRENCY', 1);
    this.maxQueue = this.setting('IMAGE_PROCESSING_MAX_QUEUE', 4, 100);
    this.queueTimeoutMs = this.setting(
      'IMAGE_PROCESSING_QUEUE_TIMEOUT_MS',
      15_000,
      120_000,
    );
    this.perTenant = this.setting('IMAGE_PROCESSING_PER_TENANT', 1, 4);
    if (this.concurrency > 4)
      throw new Error('IMAGE_PROCESSING_CONCURRENCY exceeds 4');
    if (this.perTenant > this.concurrency)
      throw new Error('IMAGE_PROCESSING_PER_TENANT exceeds global concurrency');
  }

  async run<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
    const release = await this.acquire(tenantId);
    try {
      return await work();
    } finally {
      release();
    }
  }

  snapshot(): ImageProcessingSnapshot {
    return {
      activePipelines: this.active,
      queuedPipelines: this.queue.length,
      activeByTenant: Object.fromEntries(this.activeByTenant),
    };
  }

  async onApplicationShutdown() {
    this.shuttingDown = true;
    const error = new ServiceUnavailableException(
      'Image processing is shutting down. Retry later.',
    );
    while (this.queue.length) {
      const waiter = this.queue.shift()!;
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    if (!this.active) return;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        new Promise<void>((resolve) => this.idleWaiters.push(resolve)),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, Math.min(this.queueTimeoutMs, 30_000));
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      this.idleWaiters = [];
    }
  }

  private acquire(tenantId: string): Promise<() => void> {
    if (this.shuttingDown)
      return Promise.reject(
        new ImageCapacityException(
          'Image processing is shutting down. Retry later.',
          1,
        ),
      );
    if (this.canStart(tenantId)) return Promise.resolve(this.start(tenantId));
    if (this.queue.length >= this.maxQueue)
      return Promise.reject(
        new ImageCapacityException(
          'Image processing capacity is full. Retry later.',
          Math.ceil(this.queueTimeoutMs / 1000),
        ),
      );

    return new Promise((resolve, reject) => {
      const waiter = {} as Waiter;
      waiter.tenantId = tenantId;
      waiter.resolve = resolve;
      waiter.reject = reject;
      waiter.timer = setTimeout(() => {
        const index = this.queue.indexOf(waiter);
        if (index >= 0) this.queue.splice(index, 1);
        reject(
          new ImageCapacityException(
            'Timed out waiting for image processing capacity. Retry later.',
            1,
          ),
        );
        this.drain();
      }, this.queueTimeoutMs);
      waiter.timer.unref?.();
      this.queue.push(waiter);
    });
  }

  private canStart(tenantId: string) {
    return (
      this.active < this.concurrency &&
      (this.activeByTenant.get(tenantId) ?? 0) < this.perTenant
    );
  }

  private start(tenantId: string) {
    this.active += 1;
    this.activeByTenant.set(
      tenantId,
      (this.activeByTenant.get(tenantId) ?? 0) + 1,
    );
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const tenantActive = (this.activeByTenant.get(tenantId) ?? 1) - 1;
      if (tenantActive) this.activeByTenant.set(tenantId, tenantActive);
      else this.activeByTenant.delete(tenantId);
      this.drain();
      if (!this.active) {
        const waiters = this.idleWaiters.splice(0);
        waiters.forEach((resolve) => resolve());
      }
    };
  }

  private drain() {
    // FIFO with tenant head bypass only when the head is tenant-limited. This
    // avoids one tenant blocking all replicas while retaining arrival order.
    while (this.active < this.concurrency && this.queue.length) {
      const index = this.queue.findIndex((waiter) =>
        this.canStart(waiter.tenantId),
      );
      if (index < 0) return;
      const waiter = this.queue.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(this.start(waiter.tenantId));
    }
  }

  private setting(name: string, fallback: number, maximum = 4) {
    const raw = process.env[name];
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw new Error(`${name} must be an integer between 1 and ${maximum}`);
    }
    return value;
  }
}
