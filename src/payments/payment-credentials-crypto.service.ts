import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ProviderCredentials } from './ports/payment-provider.interface';

@Injectable()
export class PaymentCredentialsCryptoService {
  encrypt(
    value: ProviderCredentials,
    tenantId: string,
    connectionId: string,
    version: number,
  ) {
    const { key, keyVersion } = this.config();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.aad(tenantId, connectionId, version, keyVersion));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [
      'paygcm',
      'v1',
      keyVersion,
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join(':');
  }
  decrypt(
    value: string,
    tenantId: string,
    connectionId: string,
    version: number,
  ): ProviderCredentials {
    try {
      const [kind, format, keyVersion, iv, encrypted, tag] = value.split(':');
      const config = this.config();
      if (
        kind !== 'paygcm' ||
        format !== 'v1' ||
        keyVersion !== config.keyVersion
      )
        throw new Error('invalid');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        config.key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAAD(this.aad(tenantId, connectionId, version, keyVersion));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(encrypted, 'base64url')),
          decipher.final(),
        ]).toString('utf8'),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Credencial de pagamento indisponivel. Reconecte o provedor.',
      );
    }
  }
  private config() {
    const raw = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY || '';
    const key = Buffer.from(raw, 'base64');
    const keyVersion = (
      process.env.PAYMENT_CREDENTIALS_KEY_VERSION || ''
    ).trim();
    if (key.length !== 32 || !keyVersion)
      throw new ServiceUnavailableException(
        'Criptografia de pagamentos nao configurada.',
      );
    return { key, keyVersion };
  }
  private aad(
    tenantId: string,
    connectionId: string,
    version: number,
    keyVersion: string,
  ) {
    return Buffer.from(
      `nextstock:payment:${tenantId}:${connectionId}:${version}:${keyVersion}`,
    );
  }
}
