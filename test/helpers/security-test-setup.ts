import { assertSafeTestDatabaseUrl } from './test-database.guard';

process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.SUPABASE_URL = 'http://local-test.localhost:54321';
process.env.SUPABASE_PROJECT_REF = 'local-test';
process.env.PRODUCTION_SUPABASE_PROJECT_REF = '';
process.env.SUPABASE_ANON_KEY = 'test-anon-key-at-least-twenty-characters';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  'test-service-role-key-at-least-twenty-characters';
process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-at-least-twenty-characters';
process.env.AUDIT_HASH_SECRET =
  'test-audit-secret-at-least-thirty-two-characters';
process.env.SESSION_HASH_SECRET =
  'test-session-secret-at-least-thirty-two-characters';
process.env.SESSION_ENFORCEMENT_ENABLED = 'false';
process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.CERT_ENCRYPTION_KEY_VERSION = 'test-v1';
process.env.BILLING_ENFORCEMENT_ENABLED = 'false';
process.env.MERCADO_PAGO_MODE = 'sandbox';
process.env.PUBLIC_APP_URL = 'http://security.test';
process.env.CORS_ALLOWED_ORIGINS = 'http://security.test';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

if (process.env.SECURITY_TEST_DATABASE_URL) {
  const safeUrl = assertSafeTestDatabaseUrl(
    process.env.SECURITY_TEST_DATABASE_URL,
  );
  process.env.DATABASE_URL = safeUrl;
  process.env.DIRECT_URL = safeUrl;
} else {
  const unavailableLocalDatabaseUrl =
    'postgresql://security_test:security_test@127.0.0.1:65535/security_test';
  process.env.DATABASE_URL = unavailableLocalDatabaseUrl;
  process.env.DIRECT_URL = unavailableLocalDatabaseUrl;
}
