import { InternalServerErrorException } from '@nestjs/common';
import {
  CertificateCryptoService,
  decodeEncryptionKey,
} from './certificate-crypto.service';

describe('CertificateCryptoService', () => {
  const originalEnv = process.env;
  const context = {
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    certificatePath: 'tenant-a/branch-a/certificate.pfx',
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CERT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      CERT_ENCRYPTION_KEY_VERSION: 'test-v1',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it.each(['senha normal', 'á1-🔐-漢字', '', 'x'])(
    'criptografa e descriptografa a senha %p',
    (password) => {
      const service = new CertificateCryptoService();
      const encrypted = service.encryptPassword(password, context);
      if (password.length >= 4) expect(encrypted).not.toContain(password);
      expect(service.decryptPassword(encrypted, context)).toBe(password);
    },
  );

  it('usa IV aleatorio para a mesma senha', () => {
    const service = new CertificateCryptoService();
    expect(service.encryptPassword('senha', context)).not.toBe(
      service.encryptPassword('senha', context),
    );
  });

  it.each([
    ['tag', 5],
    ['ciphertext', 4],
  ])('rejeita %s adulterado', (_label, index) => {
    const service = new CertificateCryptoService();
    const parts = service.encryptPassword('senha', context).split(':');
    parts[index] = `${parts[index]}A`;
    expect(() => service.decryptPassword(parts.join(':'), context)).toThrow(
      InternalServerErrorException,
    );
  });

  it('vincula o segredo ao tenant e a filial por AAD', () => {
    const service = new CertificateCryptoService();
    const encrypted = service.encryptPassword('senha', context);
    expect(() =>
      service.decryptPassword(encrypted, {
        ...context,
        tenantId: 'tenant-b',
      }),
    ).toThrow(InternalServerErrorException);
    expect(() =>
      service.decryptPassword(encrypted, {
        ...context,
        branchId: 'branch-b',
      }),
    ).toThrow(InternalServerErrorException);
  });

  it('rejeita versao de chave desconhecida', () => {
    const service = new CertificateCryptoService();
    const parts = service.encryptPassword('senha', context).split(':');
    parts[2] = 'unknown';
    expect(() => service.decryptPassword(parts.join(':'), context)).toThrow(
      InternalServerErrorException,
    );
  });

  it.each([
    undefined,
    '',
    'not-base64',
    Buffer.alloc(31).toString('base64'),
    Buffer.alloc(33).toString('base64'),
  ])('falha cedo para chave invalida %p', (key) => {
    expect(() => decodeEncryptionKey(key)).toThrow(/exactly 32 bytes/);
  });
});
