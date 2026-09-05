import { validateEnvironment } from './environment';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db.example.test:5432/app',
  SUPABASE_ANON_KEY: 'a'.repeat(24),
  SUPABASE_SERVICE_ROLE_KEY: 'b'.repeat(24),
  BILLING_EXTERNAL_REFERENCE_SECRET: 'c'.repeat(32),
  BILLING_CHECKOUT_ENABLED: 'false',
  BILLING_WEBHOOK_ENABLED: 'false',
  BILLING_ENFORCEMENT_ENABLED: 'false',
  AUDIT_HASH_SECRET: 'd'.repeat(32),
  CERT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  CERT_ENCRYPTION_KEY_VERSION: 'v1',
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test',
  PUBLIC_APP_URL: 'https://staging.example.test',
  SUPABASE_URL: 'https://prodref.supabase.co',
  SUPABASE_PROJECT_REF: 'prodref',
  PRODUCTION_SUPABASE_PROJECT_REF: 'prodref',
  AUTH_RATE_LIMIT_HMAC_SECRET: 'r'.repeat(32),
};

describe('environment isolation guardrails', () => {
  it('defaults auth provider to supabase', () => {
    const value = validateEnvironment({ ...base, APP_ENV: 'production' });
    expect(value.AUTH_PROVIDER).toBe('supabase');
  });

  it('rejects an unavailable auth provider without echoing its value', () => {
    expect(() =>
      validateEnvironment({ ...base, AUTH_PROVIDER: 'supertokens' }),
    ).toThrow('AUTH_PROVIDER');
  });
  it('accepts a complete production environment', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
      }),
    ).not.toThrow();
  });

  it('rejects production without CORS_ALLOWED_ORIGINS', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        CORS_ALLOWED_ORIGINS: '',
      }),
    ).toThrow('CORS_ALLOWED_ORIGINS');
  });

  it('rejects enabled auth rate limiting without its HMAC secret', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        AUTH_RATE_LIMIT_ENABLED: 'true',
        AUTH_RATE_LIMIT_HMAC_SECRET: '',
      }),
    ).toThrow('AUTH_RATE_LIMIT_HMAC_SECRET');
  });

  it('allows an explicit auth rate limit opt-out', () => {
    const { AUTH_RATE_LIMIT_HMAC_SECRET: _secret, ...withoutSecret } = base;
    expect(
      validateEnvironment({
        ...withoutSecret,
        APP_ENV: 'production',
        AUTH_RATE_LIMIT_ENABLED: 'false',
      }).AUTH_RATE_LIMIT_ENABLED,
    ).toBe('false');
  });

  it('requires the HMAC secret when auth rate limiting defaults to enabled', () => {
    const { AUTH_RATE_LIMIT_HMAC_SECRET: _secret, ...withoutRateLimitConfig } =
      base;
    expect(() =>
      validateEnvironment({ ...withoutRateLimitConfig, APP_ENV: 'production' }),
    ).toThrow('AUTH_RATE_LIMIT_HMAC_SECRET');
  });

  it('enables auth rate limiting by default with a valid secret', () => {
    const withoutFlag = base;
    expect(
      validateEnvironment({
        ...withoutFlag,
        APP_ENV: 'production',
        AUTH_RATE_LIMIT_HMAC_SECRET: 'test-rate-limit-secret-32-characters',
      }).AUTH_RATE_LIMIT_ENABLED,
    ).toBe('true');
  });

  it('enables auth rate limiting with an explicit true flag and valid secret', () => {
    expect(
      validateEnvironment({
        ...base,
        AUTH_RATE_LIMIT_ENABLED: 'true',
        AUTH_RATE_LIMIT_HMAC_SECRET: 'test-rate-limit-secret-32-characters',
      }).AUTH_RATE_LIMIT_ENABLED,
    ).toBe('true');
  });

  it('rejects invalid trusted proxy topology early', () => {
    expect(() =>
      validateEnvironment({ ...base, TRUSTED_PROXY_HOPS: 'all' }),
    ).toThrow('TRUSTED_PROXY_HOPS');
  });

  it('rejects production without CERT_ENCRYPTION_KEY', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        CERT_ENCRYPTION_KEY: '',
      }),
    ).toThrow('CERT_ENCRYPTION_KEY');
  });

  it('rejects staging on the production Supabase ref', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'staging',
        SUPABASE_PROJECT_REF: 'prodref',
        STAGING_SUPABASE_PROJECT_REF: 'prodref',
        PRODUCTION_SUPABASE_PROJECT_REF: 'prodref',
        MERCADO_PAGO_MODE: 'sandbox',
      }),
    ).toThrow('Staging cannot use the production Supabase project');
  });

  it('rejects production using Mercado Pago sandbox', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        SUPABASE_PROJECT_REF: 'prodref',
        PRODUCTION_SUPABASE_PROJECT_REF: 'prodref',
        BILLING_WEBHOOK_ENABLED: 'true',
        MERCADO_PAGO_ACCESS_TOKEN: 'test-access-token',
        MERCADO_PAGO_WEBHOOK_SECRET: 'w'.repeat(24),
        MERCADO_PAGO_COLLECTOR_ID: 'collector-test',
        MERCADO_PAGO_MODE: 'sandbox',
      }),
    ).toThrow('Production cannot use Mercado Pago sandbox/test mode');
  });

  it('does not require billing secrets when billing entry points are disabled', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        BILLING_EXTERNAL_REFERENCE_SECRET: '',
        BILLING_CHECKOUT_ENABLED: 'false',
        BILLING_WEBHOOK_ENABLED: 'false',
      }),
    ).not.toThrow();
  });

  it('requires provider secrets when the billing webhook is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        BILLING_WEBHOOK_ENABLED: 'true',
      }),
    ).toThrow('MERCADO_PAGO_ACCESS_TOKEN');
  });

  it('applies deployed safeguards when APP_ENV is production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'development',
        APP_ENV: 'production',
        CORS_ALLOWED_ORIGINS: '',
      }),
    ).toThrow('CORS_ALLOWED_ORIGINS');
  });

  it('accepts SUPABASE_PUBLISHABLE_KEY instead of SUPABASE_ANON_KEY', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        SUPABASE_ANON_KEY: '',
        SUPABASE_PUBLISHABLE_KEY: 'p'.repeat(24),
      }),
    ).not.toThrow();
  });

  it('rejects a Supabase runtime database from another project', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        DATABASE_URL:
          'postgresql://postgres.otherref:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres',
      }),
    ).toThrow('DATABASE_URL does not match SUPABASE_PROJECT_REF');
  });

  it('accepts matching Supabase runtime and administrative databases', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        DATABASE_URL:
          'postgresql://postgres.prodref:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres',
        ADMIN_DATABASE_URL:
          'postgresql://postgres.prodref:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
      }),
    ).not.toThrow();
  });

  it.each([
    ['coexistence', false],
    ['supabase_only', true],
  ])(
    'validates migration source against the exact provider mode (%s)',
    (mode, rejects) => {
      const input = {
        ...base,
        APP_ENV: 'production',
        AUTH_MIGRATION_ENABLED: 'true',
        AUTH_MIGRATION_SOURCE_PROVIDER: 'supertokens',
        AUTH_PROVIDER_MODE: mode,
        SUPERTOKENS_CONNECTION_URI: 'http://127.0.0.1:3567',
        SUPERTOKENS_APP_NAME: 'test',
        SUPERTOKENS_API_DOMAIN: 'http://localhost:3000',
        SUPERTOKENS_API_KEY: 'test-key',
        LOCAL_AUTH_JWT_ACTIVE_KEY:
          'test-only-local-jwt-active-key-0123456789012345',
        LOCAL_AUTH_JWT_KID: 'test-active-kid',
      };
      if (rejects) expect(() => validateEnvironment(input)).toThrow();
      else expect(() => validateEnvironment(input)).not.toThrow();
    },
  );

  it('keeps migration disabled and dry-run by default', () => {
    const value = validateEnvironment({ ...base, APP_ENV: 'production' });
    expect(value.AUTH_MIGRATION_ENABLED).toBe('false');
    expect(value.AUTH_MIGRATION_DRY_RUN).toBe('true');
  });

  it('rejects an unknown migration source provider', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        AUTH_MIGRATION_SOURCE_PROVIDER: 'unknown',
      }),
    ).toThrow('AUTH_MIGRATION_SOURCE_PROVIDER');
  });
});
