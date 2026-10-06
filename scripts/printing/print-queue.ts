import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PaperWidthMm, encodeEscPos, htmlToReceiptText } from './escpos';

export type PrintJobStatus =
  | 'pending'
  | 'sent'
  | 'printed'
  | 'error'
  | 'unknown';
export type PrintJob = {
  id: string;
  idempotencyKey: string;
  paperWidthMm: PaperWidthMm;
  html: string;
  status: PrintJobStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
};
export type PrintResolution =
  | 'confirm_not_printed'
  | 'confirm_printed'
  | 'cancel';

export class UnknownPrintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownPrintError';
  }
}

export interface PrinterTransport {
  send(payload: Buffer, job: PrintJob): Promise<void>;
}

export class SimulatedPrinterTransport implements PrinterTransport {
  constructor(private readonly outputDirectory: string) {}

  async send(payload: Buffer, job: PrintJob) {
    await mkdir(this.outputDirectory, { recursive: true });
    await writeFile(join(this.outputDirectory, `${job.id}.bin`), payload);
  }
}

export class PrintQueue {
  private jobs: PrintJob[] = [];
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private resumed = false;
  private persistTail: Promise<void> = Promise.resolve();
  private active = new Set<string>();
  private retryAfterActive = new Set<string>();

  constructor(
    private readonly filePath: string,
    private readonly transport: PrinterTransport,
    private readonly maxAttempts = 3,
  ) {}

  private async load() {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        this.jobs = JSON.parse(
          await readFile(this.filePath, 'utf8'),
        ) as PrintJob[];
      } catch {
        this.jobs = [];
      }
      this.loaded = true;
      if (!this.resumed) {
        this.resumed = true;
        queueMicrotask(() => {
          this.jobs
            .filter(
              (job) =>
                job.status !== 'printed' &&
                job.status !== 'unknown' &&
                job.attempts < this.maxAttempts,
            )
            .forEach((job) => void this.process(job.id));
        });
      }
    })();
    return this.loadPromise;
  }

  private async persist() {
    this.persistTail = this.persistTail.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(this.jobs, null, 2), 'utf8');
      await rename(temporary, this.filePath);
    });
    return this.persistTail;
  }

  async enqueue(input: {
    idempotencyKey: string;
    html: string;
    paperWidthMm: PaperWidthMm;
  }) {
    await this.load();
    const existing = this.jobs.find(
      (job) => job.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (existing.status !== 'printed' && existing.status !== 'unknown') {
        void this.process(existing.id);
      }
      return existing;
    }
    const now = new Date().toISOString();
    const job: PrintJob = {
      id: randomUUID(),
      ...input,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.push(job);
    await this.persist();
    void this.process(job.id);
    return job;
  }

  async get(id: string) {
    await this.load();
    return this.jobs.find((job) => job.id === id);
  }

  async resolve(id: string, resolution: PrintResolution) {
    await this.load();
    const job = this.jobs.find((item) => item.id === id);
    if (!job) return undefined;
    // Resolutions are valid only while delivery is ambiguous. Once a job has
    // transitioned, repeating the request must be a harmless no-op.
    if (job.status !== 'unknown') return job;
    if (resolution === 'confirm_printed') {
      job.status = 'printed';
      job.error = undefined;
    } else if (resolution === 'confirm_not_printed') {
      job.status = 'pending';
      job.error = undefined;
      job.attempts = 0;
      if (this.active.has(job.id)) {
        this.retryAfterActive.add(job.id);
      } else {
        void this.process(job.id);
      }
    } else {
      job.status = 'error';
      job.error = 'Cancelled by operator after ambiguous delivery.';
    }
    job.updatedAt = new Date().toISOString();
    await this.persist();
    return job;
  }

  async process(id: string) {
    await this.load();
    const job = this.jobs.find((item) => item.id === id);
    if (
      !job ||
      this.active.has(id) ||
      job.status === 'printed' ||
      job.status === 'unknown'
    ) {
      return job;
    }
    this.active.add(id);
    try {
      job.attempts += 1;
      job.status = 'sent';
      job.updatedAt = new Date().toISOString();
      await this.persist();
      const text = htmlToReceiptText(job.html, job.paperWidthMm);
      await this.transport.send(encodeEscPos(text, job.paperWidthMm), job);
      job.status = 'printed';
      job.error = undefined;
      job.updatedAt = new Date().toISOString();
      await this.persist();
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error);
      job.status = error instanceof UnknownPrintError ? 'unknown' : 'error';
      job.updatedAt = new Date().toISOString();
      await this.persist();
      if (job.status === 'error' && job.attempts < this.maxAttempts) {
        setTimeout(() => void this.process(id), 250 * 2 ** (job.attempts - 1));
      }
    } finally {
      this.active.delete(id);
      if (this.retryAfterActive.delete(id)) {
        queueMicrotask(() => void this.process(id));
      }
    }
    return job;
  }
}
