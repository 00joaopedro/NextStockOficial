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
    return this.encrypt(Buffer.from(password, 'utf8'), context, 'a1-password').toString('utf8');
  }

  decryptPassword(value: string, context: CertificateSecretContext) {
    return this.decrypt(value, context, 'a1-password').toString('utf8');
  }

  /**
   * The PKCS#12 bytes are encrypted before they reach Supabase Storage.
   * Storage ACLs remain useful, but are no longer the only protection at rest.
   */
  encryptCertificate(buffer: Buffer, context: CertificateSecretContext) {
    return Buffer.from(
      this.encrypt(buffer, context, 'a1-certificate').toString('utf8'),
      'utf8',
    );
  }

  decryptCertificate(value: Buffer, context: CertificateSecretContext) {
    return this.decrypt(
      value.toString('utf8'),
      context,
      'a1-certificate',
    );
  }

  private encrypt(
    plaintext: Buffer,
    context: CertificateSecretContext,
    purpose: 'a1-password' | 'a1-certificate',
  ) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(context, this.keyVersion, purpose));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.from(
      [
        purpose === 'a1-password' ? 'a1gcm' : 'a1blob',
        'v1',
        this.keyVersion,
        iv.toString('base64url'),
        ciphertext.toString('base64url'),
        tag.toString('base64url'),
      ].join(':'),
      'utf8',
    );
  }

  private decrypt(
    value: string,
    context: CertificateSecretContext,
    purpose: 'a1-password' | 'a1-certificate',
  ) {
    try {
      const parsed = this.parse(
        value,
        purpose === 'a1-password' ? 'a1gcm' : 'a1blob',
      );
      if (parsed.keyVersion !== this.keyVersion) {
        throw new Error('Unknown certificate encryption key version.');
      }
      const decipher = createDecipheriv('aes-256-gcm', this.key, parsed.iv);
      decipher.setAAD(this.aad(context, parsed.keyVersion, purpose));
      decipher.setAuthTag(parsed.tag);
      return Buffer.concat([
        decipher.update(parsed.ciphertext),
        decipher.final(),
      ]);
    } catch {
      throw new InternalServerErrorException({
        code:
          purpose === 'a1-password'
            ? 'CERTIFICATE_SECRET_DECRYPT_FAILED'
            : 'CERTIFICATE_BLOB_DECRYPT_FAILED',
        message:
          'Nao foi possivel desbloquear o certificado. Contate o suporte.',
      });
    }
  }

  private parse(value: string, prefix: 'a1gcm' | 'a1blob'): ParsedCiphertext {
    const parts = String(value || '').split(':');
    if (
      parts.length !== 6 ||
      parts[0] !== prefix ||
      parts[1] !== 'v1' ||
      !parts[2]
    ) {
      throw new Error('Invalid encrypted certificate format.');
    }
    const iv = Buffer.from(parts[3], 'base64url');
    const ciphertext = Buffer.from(parts[4], 'base64url');
    const tag = Buffer.from(parts[5], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error('Invalid AES-GCM parameters.');
    }
    return { keyVersion: parts[2], iv, ciphertext, tag };
  }

  private aad(
    context: CertificateSecretContext,
    keyVersion: string,
    purpose: string,
  ) {
    if (!context.tenantId || !context.branchId || !context.certificatePath) {
      throw new ServiceUnavailableException(
        'Contexto seguro do certificado esta incompleto.',
      );
    }
    return Buffer.from(
      [
        'nextstock',
        purpose,
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
