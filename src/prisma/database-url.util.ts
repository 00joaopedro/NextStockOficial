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
  url.searchParams.set('connection_limit', '1');

  return url.toString();
}
