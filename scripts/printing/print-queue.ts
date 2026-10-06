import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  EscPosCodePage,
  PaperWidthMm,
  encodeEscPos,
  htmlToReceiptText,
} from './escpos';

export type PrintJobStatus =
  | 'pending'
  | 'accepted'
  | 'spooled'
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
  spoolerJobId?: string;
  error?: string;
};

export type PrintResolution =
  | 'confirm_not_printed'
  | 'confirm_printed'
  | 'cancel';

export type PrintTransportResult = {
  status: 'accepted' | 'spooled' | 'printed' | 'error' | 'unknown';
  spoolerJobId?: string;
  error?: string;
};

export class UnknownPrintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownPrintError';
  }
}

export interface PrinterTransport {
  send(payload: Buffer, job: PrintJob): Promise<PrintTransportResult | void>;
  query?(job: PrintJob): Promise<PrintTransportResult>;
}

export class SimulatedPrinterTransport implements PrinterTransport {
  constructor(private readonly outputDirectory: string) {}

  async send(payload: Buffer, job: PrintJob): Promise<PrintTransportResult> {
    await mkdir(this.outputDirectory, { recursive: true });
    await writeFile(join(this.outputDirectory, `${job.id}.bin`), payload);
    return { status: 'printed' };
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
  private monitoring = new Set<string>();

  constructor(
    private readonly filePath: string,
    private readonly transport: PrinterTransport,
    private readonly maxAttempts = 3,
    private readonly codePage: EscPosCodePage = 'cp858',
  ) {}

  private async loadPersistedJobs(): Promise<PrintJob[]> {
    const candidates = [this.filePath, `${this.filePath}.bak`];
    for (const candidate of candidates) {
      try {
        const parsed: unknown = JSON.parse(await readFile(candidate, 'utf8'));
        if (Array.isArray(parsed)) return parsed as PrintJob[];
      } catch {
        // Try the previous atomic snapshot before starting empty.
      }
    }
    return [];
  }

  private async load() {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      this.jobs = await this.loadPersistedJobs();
      this.loaded = true;
      if (!this.resumed) {
        this.resumed = true;
        queueMicrotask(() => {
          this.jobs
            .filter(
              (job) =>
                !['printed', 'unknown', 'accepted', 'spooled'].includes(
                  job.status,
                ) && job.attempts < this.maxAttempts,
            )
            .forEach((job) => void this.process(job.id));
          this.jobs
            .filter((job) => ['accepted', 'spooled'].includes(job.status))
            .forEach((job) => void this.monitor(job.id));
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
      try {
        await copyFile(this.filePath, `${this.filePath}.bak`);
      } catch {
        // There is no previous snapshot on the first write.
      }
      await rename(temporary, this.filePath);
    });
    return this.persistTail;
  }

  private async monitor(id: string) {
    await this.load();
    if (this.monitoring.has(id)) return;
    this.monitoring.add(id);
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const job = this.jobs.find((item) => item.id === id);
        if (
          !job ||
          ['printed', 'error', 'unknown'].includes(job.status) ||
          !this.transport.query
        ) {
          return;
        }
        const result = await this.transport.query(job);
        if (result.spoolerJobId) job.spoolerJobId = result.spoolerJobId;
        if (result.error) job.error = result.error;
        if (result.status === 'accepted' || result.status === 'spooled') {
          job.status = result.status;
          job.updatedAt = new Date().toISOString();
          await this.persist();
          continue;
        }
        job.status = result.status;
        job.error =
          result.status === 'printed' ? undefined : result.error || job.error;
        job.updatedAt = new Date().toISOString();
        await this.persist();
        // A spooler-reported error happens after acceptance. Keep the
        // job terminal/observable and require operator resolution; retrying
        // here could duplicate a receipt that remains queued in Windows.
        return;
      }
      const job = this.jobs.find((item) => item.id === id);
      if (job && ['accepted', 'spooled'].includes(job.status)) {
        job.status = 'unknown';
        job.error = 'Spooler status timed out; operator confirmation required.';
        job.updatedAt = new Date().toISOString();
        await this.persist();
      }
    } finally {
      this.monitoring.delete(id);
    }
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
      if (
        !['printed', 'unknown', 'accepted', 'spooled'].includes(existing.status)
      ) {
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
      ['printed', 'unknown', 'accepted', 'spooled'].includes(job.status)
    ) {
      return job;
    }
    this.active.add(id);
    try {
      job.attempts += 1;
      job.status = 'accepted';
      job.updatedAt = new Date().toISOString();
      await this.persist();
      const text = htmlToReceiptText(job.html, job.paperWidthMm);
      const result = (await this.transport.send(
        encodeEscPos(text, job.paperWidthMm, this.codePage),
        job,
      )) || { status: 'printed' as const };
      if (result.spoolerJobId) job.spoolerJobId = result.spoolerJobId;
      job.status = result.status;
      job.error = result.status === 'printed' ? undefined : result.error;
      job.updatedAt = new Date().toISOString();
      await this.persist();
      if (result.status === 'accepted' || result.status === 'spooled') {
        void this.monitor(job.id);
      }
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
