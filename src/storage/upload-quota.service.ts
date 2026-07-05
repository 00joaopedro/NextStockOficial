import { PayloadTooLargeException, Injectable } from '@nestjs/common';
import { StoredFileStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UploadQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(input: {
    tenantId: string;
    ownerProfileId?: string | null;
    incomingBytes: number;
    incomingFiles?: number;
  }) {
    if (process.env.UPLOAD_ENABLE_QUOTAS !== 'true') return;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [dailyTenant, dailyUser, total, tenant] = await Promise.all([
      this.prisma.storedFile.aggregate({
        where: { tenantId: input.tenantId, uploadedAt: { gte: start } },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
      input.ownerProfileId
        ? this.prisma.storedFile.aggregate({
            where: {
              tenantId: input.tenantId,
              ownerProfileId: input.ownerProfileId,
              uploadedAt: { gte: start },
            },
            _sum: { sizeBytes: true },
          })
        : null,
      this.prisma.storedFile.aggregate({
        where: { tenantId: input.tenantId, status: StoredFileStatus.ACTIVE },
        _sum: { sizeBytes: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { currentPlan: { select: { features: true } } },
      }),
    ]);
    const planFeatures = tenant?.currentPlan?.features as Record<
      string,
      unknown
    > | null;
    const storageLimit = this.limit(
      planFeatures?.uploadStorageBytes,
      'UPLOAD_STORAGE_BYTES_PER_TENANT',
      5 * 1024 ** 3,
    );
    const dailyBytes = this.limit(
      planFeatures?.uploadDailyBytes,
      'UPLOAD_DAILY_BYTES_PER_TENANT',
      500 * 1024 ** 2,
    );
    const dailyFiles = this.limit(
      planFeatures?.uploadDailyFiles,
      'UPLOAD_DAILY_FILES_PER_TENANT',
      200,
    );
    const userBytes = this.limit(
      undefined,
      'UPLOAD_DAILY_BYTES_PER_USER',
      100 * 1024 ** 2,
    );
    const incoming = BigInt(Math.max(0, input.incomingBytes));
    if ((total._sum.sizeBytes ?? 0n) + incoming > BigInt(storageLimit)) {
      throw new PayloadTooLargeException(
        'Quota total de armazenamento excedida.',
      );
    }
    if ((dailyTenant._sum.sizeBytes ?? 0n) + incoming > BigInt(dailyBytes)) {
      throw new PayloadTooLargeException('Quota diaria do tenant excedida.');
    }
    if (dailyTenant._count._all + (input.incomingFiles ?? 1) > dailyFiles) {
      throw new PayloadTooLargeException(
        'Quantidade diaria de uploads excedida.',
      );
    }
    if (
      dailyUser &&
      (dailyUser._sum.sizeBytes ?? 0n) + incoming > BigInt(userBytes)
    ) {
      throw new PayloadTooLargeException('Quota diaria do usuario excedida.');
    }
  }

  private limit(feature: unknown, env: string, fallback: number) {
    const value = Number(feature ?? process.env[env] ?? fallback);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}
