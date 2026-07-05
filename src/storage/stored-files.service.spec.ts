import { StoredFilesService } from './stored-files.service';
import { ForbiddenException } from '@nestjs/common';

describe('StoredFilesService', () => {
  it('stores hash and metadata without file content', async () => {
    const prisma = {
      storedFile: { create: jest.fn().mockResolvedValue({ id: 'file-1' }) },
    };
    const service = new StoredFilesService(prisma as any);
    await service.register({
      tenantId: 'tenant-1',
      module: 'expenses',
      bucket: 'private',
      storagePath: 'tenant-1/file.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('safe-test'),
    });
    const data = prisma.storedFile.create.mock.calls[0][0].data;
    expect(data.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(data.sizeBytes).toBe(9n);
    expect(data).not.toHaveProperty('buffer');
  });

  it('blocks deleted or infected inventory entries', async () => {
    const service = new StoredFilesService({
      storedFile: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'DELETED',
          scanStatus: 'NOT_REQUIRED',
        }),
      },
    } as any);
    await expect(
      service.assertDownloadable('tenant/file.pdf'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
