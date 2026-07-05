import { validateEnvironment } from './environment';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db.example.test:5432/app',
  SUPABASE_ANON_KEY: 'a'.repeat(24),
  SUPABASE_SERVICE_ROLE_KEY: 'b'.repeat(24),
  BILLING_EXTERNAL_REFERENCE_SECRET: 'c'.repeat(32),
  AUDIT_HASH_SECRET: 'd'.repeat(32),
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test',
  PUBLIC_APP_URL: 'https://staging.example.test',
};

describe('environment isolation guardrails', () => {
  it('rejects staging on the production Supabase ref', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'staging',
        SUPABASE_URL: 'https://prodref.supabase.co',
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
        SUPABASE_URL: 'https://prodref.supabase.co',
        SUPABASE_PROJECT_REF: 'prodref',
        PRODUCTION_SUPABASE_PROJECT_REF: 'prodref',
        MERCADO_PAGO_MODE: 'sandbox',
      }),
    ).toThrow('Production cannot use Mercado Pago sandbox/test mode');
  });
});
