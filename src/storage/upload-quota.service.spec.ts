import { ConflictException } from '@nestjs/common';
import { UploadQuotaService } from './upload-quota.service';

describe('UploadQuotaService', () => {
  beforeEach(() => {
    process.env.UPLOAD_ENABLE_QUOTAS = 'true';
    process.env.UPLOAD_STORAGE_BYTES_PER_TENANT = '100';
    process.env.UPLOAD_DAILY_BYTES_PER_TENANT = '100';
    process.env.UPLOAD_DAILY_BYTES_PER_USER = '100';
    process.env.UPLOAD_DAILY_FILES_PER_TENANT = '10';
  });

  it('rejects a path outside the authoritative tenant namespace', async () => {
    const service = new UploadQuotaService({} as any);
    await expect(
      service.reserve({
        tenantId: 'tenant-1',
        incomingBytes: 20,
        idempotencyKey: 'intent-1',
        objectKeys: ['tenant-2/file'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does nothing while the feature flag is disabled', async () => {
    process.env.UPLOAD_ENABLE_QUOTAS = 'false';
    const service = new UploadQuotaService({} as any);
    await expect(
      service.assertAllowed({ tenantId: 'tenant-1', incomingBytes: 999 }),
    ).resolves.toBeNull();
  });
});
