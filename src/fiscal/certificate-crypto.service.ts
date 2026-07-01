import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export type CertificateSecretContext = {
  tenantId: string;
  branchId: string;
  certificatePath: string;
};

type ParsedCiphertext = {
  keyVersion: string;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
};

@Injectable()
export class CertificateCryptoService {
  private readonly key: Buffer;
  readonly keyVersion: string;

  constructor() {
    this.key = decodeEncryptionKey(process.env.CERT_ENCRYPTION_KEY);
    this.keyVersion = requireKeyVersion(
      process.env.CERT_ENCRYPTION_KEY_VERSION,
    );
  }

  encryptPassword(password: string, context: CertificateSecretContext) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(context, this.keyVersion));
    const ciphertext = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      'a1gcm',
      'v1',
      this.keyVersion,
      iv.toString('base64url'),
      ciphertext.toString('base64url'),
      tag.toString('base64url'),
    ].join(':');
  }

  decryptPassword(value: string, context: CertificateSecretContext) {
    try {
      const parsed = this.parse(value);
      if (parsed.keyVersion !== this.keyVersion) {
        throw new Error('Unknown certificate encryption key version.');
      }
      const decipher = createDecipheriv('aes-256-gcm', this.key, parsed.iv);
      decipher.setAAD(this.aad(context, parsed.keyVersion));
      decipher.setAuthTag(parsed.tag);
      return Buffer.concat([
        decipher.update(parsed.ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException({
        code: 'CERTIFICATE_SECRET_DECRYPT_FAILED',
        message:
          'Nao foi possivel desbloquear o certificado. Contate o suporte.',
      });
    }
  }

  private parse(value: string): ParsedCiphertext {
    const parts = String(value || '').split(':');
    if (
      parts.length !== 6 ||
      parts[0] !== 'a1gcm' ||
      parts[1] !== 'v1' ||
      !parts[2]
    ) {
      throw new Error('Invalid encrypted certificate password format.');
    }
    const iv = Buffer.from(parts[3], 'base64url');
    const ciphertext = Buffer.from(parts[4], 'base64url');
    const tag = Buffer.from(parts[5], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error('Invalid AES-GCM parameters.');
    }
    return { keyVersion: parts[2], iv, ciphertext, tag };
  }

  private aad(context: CertificateSecretContext, keyVersion: string) {
    if (!context.tenantId || !context.branchId || !context.certificatePath) {
      throw new ServiceUnavailableException(
        'Contexto seguro do certificado esta incompleto.',
      );
    }
    return Buffer.from(
      [
        'nextstock',
        'a1-password',
        context.tenantId,
        context.branchId,
        context.certificatePath,
        keyVersion,
      ].join(':'),
      'utf8',
    );
  }
}

export function decodeEncryptionKey(value?: string) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(
      'CERT_ENCRYPTION_KEY must be valid base64 containing exactly 32 bytes.',
    );
  }
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.length !== 32 ||
    decoded.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')
  ) {
    throw new Error(
      'CERT_ENCRYPTION_KEY must be valid base64 containing exactly 32 bytes.',
    );
  }
  return decoded;
}

function requireKeyVersion(value?: string) {
  const version = value?.trim();
  if (!version || !/^[A-Za-z0-9._-]{1,40}$/.test(version)) {
    throw new Error('CERT_ENCRYPTION_KEY_VERSION is missing or invalid.');
  }
  return version;
}
