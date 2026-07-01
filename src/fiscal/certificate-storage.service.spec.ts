import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CertificateStorageService } from './certificate-storage.service';

describe('CertificateStorageService', () => {
  function setup() {
    const bucket = {
      upload: jest.fn().mockResolvedValue({ error: null }),
      download: jest.fn(),
      remove: jest.fn().mockResolvedValue({ error: null }),
      createSignedUrl: jest.fn(),
      getPublicUrl: jest.fn(),
    };
    const supabase: any = {
      admin: {
        storage: {
          from: jest.fn().mockReturnValue(bucket),
        },
      },
    };
    return {
      service: new CertificateStorageService(supabase),
      bucket,
      supabase,
    };
  }

  it('cria path opaco isolado por tenant e branch', () => {
    const { service } = setup();
    expect(service.createPath('tenant-a', 'branch-a')).toMatch(
      /^tenant-a\/branch-a\/[0-9a-f-]{36}\.pfx$/,
    );
  });

  it('faz upload privado sem upsert e sem gerar URL', async () => {
    const { service, bucket } = setup();
    await service.upload('tenant-a/branch-a/id.pfx', Buffer.from('pfx'));
    expect(bucket.upload).toHaveBeenCalledWith(
      'tenant-a/branch-a/id.pfx',
      expect.any(Buffer),
      {
        contentType: 'application/x-pkcs12',
        upsert: false,
      },
    );
    expect(bucket.createSignedUrl).not.toHaveBeenCalled();
    expect(bucket.getPublicUrl).not.toHaveBeenCalled();
  });

  it('traduz bucket ausente em erro amigavel', async () => {
    const { service, bucket } = setup();
    bucket.upload.mockResolvedValue({
      error: { message: 'Bucket not found' },
    });
    await expect(
      service.upload('tenant-a/branch-a/id.pfx', Buffer.from('pfx')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('cleanup pendente nao expoe identificador nem derruba substituicao', async () => {
    const { service, bucket } = setup();
    bucket.remove.mockResolvedValue({ error: { message: 'failure' } });
    await expect(
      service.cleanup('tenant-a/branch-a/secret.pfx', 'replaced'),
    ).resolves.toBe(false);
  });

  it('remove reporta falha controlada', async () => {
    const { service, bucket } = setup();
    bucket.remove.mockResolvedValue({ error: { message: 'failure' } });
    await expect(
      service.remove('tenant-a/branch-a/id.pfx'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
