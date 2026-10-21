import { FiscalCertificateCleanupStatus } from '@prisma/client';
import { CertificateCleanupService } from './certificate-cleanup.service';

describe('CertificateCleanupService', () => {
  function setup() {
    const prisma: any = {
      fiscalCertificateCleanupJob: {
        upsert: jest.fn().mockResolvedValue({ id: 'job-a' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'job-a' }),
      },
    };
    const storage = { remove: jest.fn().mockResolvedValue(undefined) };
    return { service: new CertificateCleanupService(prisma, storage as any), prisma, storage };
  }

  it('enfileira limpeza pendente sem registrar o certificado em logs', async () => {
    const { service, prisma } = setup();
    await service.enqueue('tenant-a', 'branch-a', 'private/object.pfx', 'replaced');
    expect(prisma.fiscalCertificateCleanupJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_storagePath: { tenantId: 'tenant-a', storagePath: 'private/object.pfx' } },
      }),
    );
  });

  it('marca como entregue quando a remocao funciona', async () => {
    const { service, prisma, storage } = setup();
    prisma.fiscalCertificateCleanupJob.findMany.mockResolvedValue([
      { id: 'job-a', storagePath: 'private/object.pfx', attemptCount: 0 },
    ]);
    await service.processBatch();
    expect(storage.remove).toHaveBeenCalledWith('private/object.pfx');
    expect(prisma.fiscalCertificateCleanupJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: FiscalCertificateCleanupStatus.DELIVERED }) }),
    );
  });

  it('agenda nova tentativa quando a remocao falha', async () => {
    const { service, prisma, storage } = setup();
    storage.remove.mockRejectedValue(new Error('storage unavailable'));
    prisma.fiscalCertificateCleanupJob.findMany.mockResolvedValue([
      { id: 'job-a', storagePath: 'private/object.pfx', attemptCount: 0 },
    ]);
    await service.processBatch();
    expect(prisma.fiscalCertificateCleanupJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: FiscalCertificateCleanupStatus.FAILED_RETRYABLE,
          lastErrorCode: 'CERTIFICATE_STORAGE_CLEANUP_FAILED',
        }),
      }),
    );
  });
});
