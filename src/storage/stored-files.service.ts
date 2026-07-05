import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  StoredFileScanStatus,
  StoredFileStatus,
  StoredFileVisibility,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoredFilesService {
  constructor(private readonly prisma: PrismaService) {}

  register(input: {
    tenantId: string;
    branchId?: string | null;
    ownerProfileId?: string | null;
    module: string;
    targetType?: string | null;
    targetId?: string | null;
    bucket: string;
    storagePath: string;
    originalName?: string | null;
    mimeType: string;
    buffer: Buffer;
    visibility?: StoredFileVisibility;
    scanStatus?: StoredFileScanStatus;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.storedFile.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId || null,
        ownerProfileId: input.ownerProfileId || null,
        module: input.module,
        targetType: input.targetType || null,
        targetId: input.targetId || null,
        bucket: input.bucket,
        storagePath: input.storagePath,
        originalName: input.originalName || null,
        mimeType: input.mimeType,
        extension: extname(input.originalName || '') || null,
        sizeBytes: BigInt(input.buffer.length),
        sha256: createHash('sha256').update(input.buffer).digest('hex'),
        visibility: input.visibility ?? StoredFileVisibility.SIGNED_ONLY,
        scanStatus: input.scanStatus ?? StoredFileScanStatus.NOT_REQUIRED,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  markDeleted(paths: Array<string | null | undefined>) {
    return this.prisma.storedFile.updateMany({
      where: {
        storagePath: {
          in: paths.filter((path): path is string => Boolean(path)),
        },
        status: StoredFileStatus.ACTIVE,
      },
      data: { status: StoredFileStatus.DELETED, deletedAt: new Date() },
    });
  }

  touch(storagePath: string) {
    return this.prisma.storedFile.updateMany({
      where: { storagePath, status: StoredFileStatus.ACTIVE },
      data: { lastAccessedAt: new Date() },
    });
  }

  async assertDownloadable(storagePath: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { storagePath },
      select: { status: true, scanStatus: true },
    });
    if (!file) return;
    if (
      file.status !== StoredFileStatus.ACTIVE ||
      file.scanStatus === StoredFileScanStatus.INFECTED ||
      file.scanStatus === StoredFileScanStatus.REJECTED
    ) {
      throw new ForbiddenException('Arquivo indisponivel para download.');
    }
  }
}
