import { BadRequestException } from '@nestjs/common';
import * as forge from 'node-forge';
import { CertificateParserService } from './certificate-parser.service';

describe('CertificateParserService', () => {
  const parser = new CertificateParserService();
  let validFixture: Buffer;
  let expiredFixture: Buffer;
  let futureFixture: Buffer;
  let noKeyFixture: Buffer;
  let cnpjFixture: Buffer;

  beforeAll(() => {
    validFixture = syntheticP12({
      password: 'teste-á1',
      notBefore: new Date(Date.now() - 86_400_000),
      notAfter: new Date(Date.now() + 86_400_000),
    });
    expiredFixture = syntheticP12({
      password: 'expired',
      notBefore: new Date(Date.now() - 172_800_000),
      notAfter: new Date(Date.now() - 86_400_000),
    });
    futureFixture = syntheticP12({
      password: 'future',
      notBefore: new Date(Date.now() + 86_400_000),
      notAfter: new Date(Date.now() + 172_800_000),
    });
    noKeyFixture = syntheticP12({
      password: 'nokey',
      notBefore: new Date(Date.now() - 86_400_000),
      notAfter: new Date(Date.now() + 86_400_000),
      withoutKey: true,
    });
    cnpjFixture = syntheticP12({
      password: 'cnpj',
      notBefore: new Date(Date.now() - 86_400_000),
      notAfter: new Date(Date.now() + 86_400_000),
      cnpj: '11222333000181',
    });
  }, 30_000);

  it('extrai metadados de PKCS#12 sintetico valido e sem CNPJ', () => {
    const result = parser.parse(validFixture, 'teste-á1');
    expect(result.hasPrivateKey).toBe(true);
    expect(result.subject).toContain('NextStock Synthetic Test');
    expect(result.issuer).toContain('NextStock Synthetic Test');
    expect(result.fingerprintSha256).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
    expect(result.cnpj).toBeNull();
  });

  it('extrai CNPJ quando presente no subject ICP-Brasil sintetico', () => {
    expect(parser.parse(cnpjFixture, 'cnpj').cnpj).toBe('11222333000181');
  });

  it.each([
    ['arquivo vazio', Buffer.alloc(0), 'x', 'CERTIFICATE_EMPTY'],
    [
      'txt renomeado',
      Buffer.from('nao e pfx'),
      'x',
      'CERTIFICATE_INVALID_FILE',
    ],
    [
      'DER aleatorio',
      Buffer.from([0x30, 0x03, 0x02, 0x01, 0x01]),
      'x',
      'CERTIFICATE_INVALID_FILE',
    ],
    [
      'certificado truncado',
      Buffer.from([0x30, 0x82, 0x01]),
      'x',
      'CERTIFICATE_INVALID_FILE',
    ],
  ])('rejeita %s', (_name, buffer, password, code) => {
    expectCode(() => parser.parse(buffer, password), code);
  });

  it('distingue senha incorreta', () => {
    expectCode(
      () => parser.parse(validFixture, 'senha-incorreta'),
      'CERTIFICATE_INVALID_PASSWORD',
    );
  });

  it('rejeita certificado expirado', () => {
    expectCode(
      () => parser.parse(expiredFixture, 'expired'),
      'CERTIFICATE_EXPIRED',
    );
  });

  it('rejeita certificado ainda nao valido', () => {
    expectCode(
      () => parser.parse(futureFixture, 'future'),
      'CERTIFICATE_NOT_YET_VALID',
    );
  });

  it('rejeita PKCS#12 sem chave privada', () => {
    expectCode(
      () => parser.parse(noKeyFixture, 'nokey'),
      'CERTIFICATE_MISSING_PRIVATE_KEY',
    );
  });
});

function syntheticP12(input: {
  password: string;
  notBefore: Date;
  notAfter: Date;
  withoutKey?: boolean;
  cnpj?: string;
}) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = input.notBefore;
  certificate.validity.notAfter = input.notAfter;
  const attributes = [
    {
      name: 'commonName',
      value: 'NextStock Synthetic Test',
    },
    { name: 'countryName', value: 'BR' },
    ...(input.cnpj ? [{ type: '2.16.76.1.3.3', value: input.cnpj }] : []),
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(
    input.withoutKey ? null : keys.privateKey,
    [certificate],
    input.password,
    { algorithm: '3des' },
  );
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

function expectCode(callback: () => unknown, code: string) {
  try {
    callback();
    throw new Error('Expected parser to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual(
      expect.objectContaining({ code }),
    );
  }
}
