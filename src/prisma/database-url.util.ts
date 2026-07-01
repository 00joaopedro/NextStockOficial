const TRANSACTION_POOLER_PORT = '6543';

export function configurePrismaRuntimeUrl(value?: string): string | undefined {
  if (!value) {
    return value;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return value;
  }

  if (url.port !== TRANSACTION_POOLER_PORT) {
    return value;
  }

  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('pgbouncer', 'true');
  const configuredLimit = Number(process.env.DATABASE_CONNECTION_LIMIT || 1);
  const connectionLimit =
    Number.isSafeInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : 1;
  url.searchParams.set('connection_limit', String(connectionLimit));

  return url.toString();
}
