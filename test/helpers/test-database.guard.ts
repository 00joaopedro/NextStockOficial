const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'postgres']);

export function assertSafeTestDatabaseUrl(rawUrl?: string) {
  if (!rawUrl) {
    throw new Error(
      'SECURITY_TEST_DATABASE_URL is required for database security tests.',
    );
  }

  const url = new URL(rawUrl);
  const database = url.pathname.replace(/^\//, '').toLowerCase();
  const explicitTestName = /test|security|ci/.test(database);
  const allowedHost =
    LOCAL_HOSTS.has(url.hostname.toLowerCase()) ||
    process.env.SECURITY_TEST_ALLOW_REMOTE === 'true';

  if (!allowedHost || !explicitTestName) {
    throw new Error(
      'Unsafe security test database URL: use a local/CI host and a database name containing test, security, or ci.',
    );
  }

  const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;
  if (
    productionRef &&
    rawUrl.toLowerCase().includes(productionRef.toLowerCase())
  ) {
    throw new Error(
      'Security tests cannot use the production Supabase project.',
    );
  }

  return rawUrl;
}

export function hasSecurityTestDatabase() {
  return Boolean(process.env.SECURITY_TEST_DATABASE_URL);
}
