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
};

describe('environment isolation guardrails', () => {
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
});
