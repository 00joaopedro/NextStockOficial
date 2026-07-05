process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.DATABASE_URL =
  process.env.SECURITY_TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:65535/nextstock_e2e_test?schema=public';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.SUPABASE_URL = 'http://local-test.localhost:54321';
process.env.SUPABASE_PROJECT_REF = 'local-test';
process.env.PRODUCTION_SUPABASE_PROJECT_REF = '';
process.env.STAGING_SUPABASE_PROJECT_REF = '';
process.env.SUPABASE_ANON_KEY = 'test-anon-key-at-least-twenty-characters';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key-at-least-twenty-characters';
process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-at-least-twenty-characters';
process.env.BILLING_EXTERNAL_REFERENCE_SECRET =
  'test-billing-secret-at-least-thirty-two-characters';
process.env.AUDIT_HASH_SECRET =
  'test-audit-secret-at-least-thirty-two-characters';
process.env.SESSION_HASH_SECRET =
  'test-session-secret-at-least-thirty-two-characters';
process.env.SESSION_ENFORCEMENT_ENABLED = 'false';
process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.CERT_ENCRYPTION_KEY_VERSION = 'test-v1';
process.env.MERCADO_PAGO_MODE = 'sandbox';
