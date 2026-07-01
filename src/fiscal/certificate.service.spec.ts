import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CertificateValidationStatus,
  FiscalEnvironment,
  Role,
  SystemMode,
  SystemType,
} from '@prisma/client';
import { CertificateService } from './certificate.service';

describe('CertificateService', () => {
  const context = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    role: Role.Admin,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    isDevSuperAdmin: false,
    contextKind: 'normal',
  };

  function setup(overrides: Record<string, any> = {}) {
    const config = {
      id: 'config-a',
      tenantId: context.tenantId,
      branchId: context.branchId,
      cnpj: '11222333000181',
      provider: 'real-provider',
      environment: FiscalEnvironment.homologacao,
      certificatePath: null,
      ...overrides,
    };
    const prisma: any = {
      companyFiscalConfig: {
        findUnique: jest.fn().mockResolvedValue(config),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...config, ...data }),
          ),
      },
    };
    const tenantContext: any = {
      resolve: jest.fn().mockResolvedValue(context),
    };
    const crypto: any = {
      keyVersion: 'v1',
      encryptPassword: jest.fn().mockReturnValue('encrypted'),
      decryptPassword: jest.fn().mockReturnValue('password'),
    };
    const parser: any = {
      parse: jest.fn().mockReturnValue({
        subject: 'CN=synthetic',
        issuer: 'CN=synthetic',
        serialNumber: '01',
        fingerprintSha256: 'AA',
        validFrom: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 86_400_000),
        cnpj: config.cnpj,
        hasPrivateKey: true,
      }),
    };
    const storage: any = {
      createPath: jest.fn().mockReturnValue('tenant-a/branch-a/new.pfx'),
      upload: jest.fn(),
      download: jest.fn().mockResolvedValue(Buffer.from('pfx')),
      cleanup: jest.fn().mockResolvedValue(true),
    };
    return {
      service: new CertificateService(
        prisma,
        tenantContext,
        crypto,
        parser,
        storage,
      ),
      prisma,
      tenantContext,
      crypto,
      parser,
      storage,
      config,
    };
  }

  const file = {
    originalname: 'certificate.pfx',
    mimetype: 'application/octet-stream',
    size: 3,
    buffer: Buffer.from('pfx'),
  };

  it('faz upload sem expor path, senha ou ciphertext', async () => {
    const { service, prisma } = setup();
    const response = await service.upload(
      { id: 'user-a' } as any,
      file,
      'password',
    );
    expect(prisma.companyFiscalConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          certificatePath: 'tenant-a/branch-a/new.pfx',
          certificatePasswordEncrypted: 'encrypted',
          certificateValidationStatus: CertificateValidationStatus.valid,
        }),
      }),
    );
    expect(JSON.stringify(response)).not.toMatch(
      /new\.pfx|encrypted|password/i,
    );
  });

  it.each([
    ['sem arquivo', undefined],
    [
      'arquivo vazio',
      {
        ...file,
        buffer: Buffer.alloc(0),
        size: 0,
      },
    ],
    ['extensao txt', { ...file, originalname: 'certificate.txt' }],
    ['MIME falso', { ...file, mimetype: 'text/plain' }],
  ])('rejeita upload %s', async (_name, invalidFile) => {
    const { service, storage } = setup();
    await expect(
      service.upload({ id: 'user-a' } as any, invalidFile as any, 'password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejeita arquivo acima do limite antes do Storage', async () => {
    const { service, storage } = setup();
    await expect(
      service.upload(
        { id: 'user-a' } as any,
        {
          ...file,
          size: 6 * 1024 * 1024,
          buffer: Buffer.from('pfx'),
        },
        'password',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('propaga senha errada sem fazer upload', async () => {
    const { service, parser, storage } = setup();
    parser.parse.mockImplementation(() => {
      throw new BadRequestException({
        code: 'CERTIFICATE_INVALID_PASSWORD',
        message: 'Confira a senha.',
      });
    });
    await expect(
      service.upload({ id: 'user-a' } as any, file, 'wrong'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('nao persiste quando Storage falha', async () => {
    const { service, prisma, storage } = setup();
    storage.upload.mockRejectedValueOnce(
      new ServiceUnavailableException('storage'),
    );
    await expect(
      service.upload({ id: 'user-a' } as any, file, 'password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.companyFiscalConfig.update).not.toHaveBeenCalled();
  });

  it('remove o novo objeto se Prisma falhar', async () => {
    const { service, prisma, storage } = setup();
    prisma.companyFiscalConfig.update.mockRejectedValueOnce(new Error('db'));
    await expect(
      service.upload({ id: 'user-a' } as any, file, 'password'),
    ).rejects.toThrow('db');
    expect(storage.cleanup).toHaveBeenCalledWith(
      'tenant-a/branch-a/new.pfx',
      'rollback',
    );
  });

  it('mantem sucesso quando cleanup do certificado antigo fica pendente', async () => {
    const { service, storage } = setup({
      certificatePath: 'tenant-a/branch-a/old.pfx',
    });
    storage.cleanup.mockResolvedValue(false);
    await expect(
      service.upload({ id: 'user-a' } as any, file, 'password'),
    ).resolves.toMatchObject({ ok: true });
    expect(storage.cleanup).toHaveBeenCalledWith(
      'tenant-a/branch-a/old.pfx',
      'replaced',
    );
  });

  it('rejeita CNPJ divergente', async () => {
    const { service, parser } = setup();
    parser.parse.mockReturnValue({
      ...parser.parse(),
      cnpj: '99999999000199',
    });
    await expect(
      service.upload({ id: 'user-a' } as any, file, 'password'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia Dev SuperAdmin para segredos mesmo em suporte', async () => {
    const { service, tenantContext } = setup();
    tenantContext.resolve.mockResolvedValue({
      ...context,
      isDevSuperAdmin: true,
      contextKind: 'dev-support',
    });
    await expect(
      service.upload({ id: 'dev' } as any, file, 'password'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('provider mock nunca ativa producao', async () => {
    const { service } = setup({
      provider: 'mock',
      certificatePath: 'tenant-a/branch-a/cert.pfx',
      certificateValidationStatus: CertificateValidationStatus.valid,
      certificateExpiresAt: new Date(Date.now() + 86_400_000),
    });
    await expect(
      service.activateProduction({ id: 'user-a' } as any, 'ATIVAR PRODUÇÃO'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('exige frase exata para producao', async () => {
    const { service } = setup();
    await expect(
      service.activateProduction({ id: 'user-a' } as any, 'sim'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
