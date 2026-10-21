import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FiscalCertificateCleanupStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateStorageService } from './certificate-storage.service';

const MAX_ATTEMPTS = 8;

@Injectable()
export class CertificateCleanupService implements OnModuleInit {
  private readonly logger = new Logger(CertificateCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CertificateStorageService,
  ) {}

  onModuleInit() {
    if (
      process.env.NEXTSTOCK_PROCESS_ROLE === 'api' ||
      process.env.CERTIFICATE_CLEANUP_WORKER_ENABLED === 'false'
    )
      return;
    const pollMs = positiveInt(process.env.CERTIFICATE_CLEANUP_POLL_MS, 30_000);
    this.timer = setInterval(() => void this.runBatch(), pollMs);
    this.timer.unref();
    void this.runBatch();
  }

  async enqueue(
    tenantId: string,
    branchId: string,
    storagePath: string,
    reason: string,
  ) {
    return this.enqueueInTransaction(this.prisma, tenantId, branchId, storagePath, reason);
  }

  async enqueueInTransaction(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    branchId: string,
    storagePath: string,
    reason: string,
  ) {
    return tx.fiscalCertificateCleanupJob.upsert({
      where: { tenantId_storagePath: { tenantId, storagePath } },
      create: { tenantId, branchId, storagePath, reason },
      update: {
        reason,
        status: FiscalCertificateCleanupStatus.PENDING,
        availableAt: new Date(),
        lastErrorCode: null,
      },
    });
  }

  async markDelivered(storagePath: string, tenantId: string) {
    await this.prisma.fiscalCertificateCleanupJob.updateMany({
      where: { tenantId, storagePath, status: { not: FiscalCertificateCleanupStatus.DELIVERED } },
      data: {
        status: FiscalCertificateCleanupStatus.DELIVERED,
        deliveredAt: new Date(),
        lastErrorCode: null,
      },
    });
  }

  async processBatch(limit = 20) {
    const jobs = await this.prisma.fiscalCertificateCleanupJob.findMany({
      where: {
        status: { in: [FiscalCertificateCleanupStatus.PENDING, FiscalCertificateCleanupStatus.FAILED_RETRYABLE] },
        availableAt: { lte: new Date() },
      },
      orderBy: { availableAt: 'asc' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    await Promise.all(jobs.map((job) => this.process(job)));
    return jobs.length;
  }

  private async runBatch() {
    try {
      await this.processBatch();
    } catch {
      this.logger.warn('Fiscal certificate cleanup worker could not query pending work.');
    }
  }

  private async process(job: {
    id: string;
    storagePath: string;
    attemptCount: number;
  }) {
    try {
      await this.storage.remove(job.storagePath);
      await this.prisma.fiscalCertificateCleanupJob.update({
        where: { id: job.id },
        data: { status: FiscalCertificateCleanupStatus.DELIVERED, deliveredAt: new Date(), lastErrorCode: null },
      });
    } catch {
      const attempts = job.attemptCount + 1;
      const final = attempts >= MAX_ATTEMPTS;
      await this.prisma.fiscalCertificateCleanupJob.update({
        where: { id: job.id },
        data: {
          attemptCount: attempts,
          status: final ? FiscalCertificateCleanupStatus.FAILED_FINAL : FiscalCertificateCleanupStatus.FAILED_RETRYABLE,
          availableAt: new Date(Date.now() + retryDelayMs(attempts)),
          lastErrorCode: 'CERTIFICATE_STORAGE_CLEANUP_FAILED',
        },
      });
      this.logger.warn(`Fiscal certificate cleanup ${final ? 'failed permanently' : 'will retry'}; storage object identifier redacted.`);
    }
  }
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function retryDelayMs(attempt: number) {
  return Math.min(60 * 60 * 1000, 1_000 * 2 ** Math.min(attempt, 12));
}
