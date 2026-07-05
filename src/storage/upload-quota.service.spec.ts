import { PayloadTooLargeException } from '@nestjs/common';
import { UploadQuotaService } from './upload-quota.service';

describe('UploadQuotaService', () => {
  beforeEach(() => {
    process.env.UPLOAD_ENABLE_QUOTAS = 'true';
    process.env.UPLOAD_STORAGE_BYTES_PER_TENANT = '100';
    process.env.UPLOAD_DAILY_BYTES_PER_TENANT = '100';
    process.env.UPLOAD_DAILY_BYTES_PER_USER = '100';
    process.env.UPLOAD_DAILY_FILES_PER_TENANT = '10';
  });

  it('blocks a tenant above total storage quota', async () => {
    const prisma = {
      storedFile: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _sum: { sizeBytes: 90n },
            _count: { _all: 1 },
          })
          .mockResolvedValueOnce({ _sum: { sizeBytes: 90n } })
          .mockResolvedValueOnce({ _sum: { sizeBytes: 90n } }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new UploadQuotaService(prisma as any);
    await expect(
      service.assertAllowed({
        tenantId: 'tenant-1',
        ownerProfileId: 'profile-1',
        incomingBytes: 20,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('does nothing while the feature flag is disabled', async () => {
    process.env.UPLOAD_ENABLE_QUOTAS = 'false';
    const service = new UploadQuotaService({} as any);
    await expect(
      service.assertAllowed({ tenantId: 'tenant-1', incomingBytes: 999 }),
    ).resolves.toBeUndefined();
  });
});
