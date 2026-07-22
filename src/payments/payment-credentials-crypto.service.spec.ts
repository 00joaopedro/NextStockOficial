import { PaymentCredentialsCryptoService } from './payment-credentials-crypto.service';

describe('PaymentCredentialsCryptoService', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = {
      ...original,
      PAYMENT_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString(
        'base64',
      ),
      PAYMENT_CREDENTIALS_KEY_VERSION: 'test-v1',
    };
  });
  afterAll(() => {
    process.env = original;
  });
  it('encrypts without exposing the token and binds ciphertext to tenant', () => {
    const service = new PaymentCredentialsCryptoService();
    const encrypted = service.encrypt(
      { accessToken: 'APP_USR-secret-value' },
      'tenant-a',
      'connection-a',
      1,
    );
    expect(encrypted).not.toContain('APP_USR-secret-value');
    expect(service.decrypt(encrypted, 'tenant-a', 'connection-a', 1)).toEqual({
      accessToken: 'APP_USR-secret-value',
    });
    expect(() =>
      service.decrypt(encrypted, 'tenant-b', 'connection-a', 1),
    ).toThrow('Credencial de pagamento indisponivel');
  });
});
