export type DatabaseUrlEnv = Record<string, string | undefined> & {
  ADMIN_DATABASE_URL?: string;
  DIRECT_URL?: string;
  DATABASE_URL?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
};

type ParsedDatabaseUrl = {
  raw: string;
  host: string;
  port: string;
  database: string;
  username: string;
  isSupabasePooler: boolean;
  isTransactionPooler: boolean;
};

const TRANSACTION_POOLER_PORT = '6543';
const FALLBACK_LOCAL_DATABASE_URL =
  'postgresql://prisma:prisma@127.0.0.1:65535/prisma?schema=public';

function normalizedEnv(env: DatabaseUrlEnv) {
  return (env.APP_ENV || env.NODE_ENV || 'development').toLowerCase();
}

export function isProtectedEnvironment(env: DatabaseUrlEnv) {
  return ['production', 'staging'].includes(normalizedEnv(env));
}

export function parseDatabaseUrl(value: string): ParsedDatabaseUrl {
  const parsed = new URL(value);
  const database = parsed.pathname.replace(/^\//, '') || 'unknown';

  return {
    raw: value,
    host: parsed.hostname,
    port: parsed.port || '5432',
    database,
    username: parsed.username,
    isSupabasePooler: parsed.hostname.includes('pooler.supabase.com'),
    isTransactionPooler:
      parsed.hostname.includes('pooler.supabase.com') &&
      (parsed.port || '5432') === TRANSACTION_POOLER_PORT,
  };
}

export function describeDatabaseUrl(value: string): string {
  try {
    const parsed = parseDatabaseUrl(value);

    return `host=${parsed.host} port=${parsed.port} database=${parsed.database}`;
  } catch {
    return 'invalid database url';
  }
}

export function selectRuntimeDatabaseUrl(env: DatabaseUrlEnv) {
  return env.DATABASE_URL || FALLBACK_LOCAL_DATABASE_URL;
}

export function selectAdministrativeDatabaseUrl(env: DatabaseUrlEnv): string {
  const protectedEnv = isProtectedEnvironment(env);
  const value = env.ADMIN_DATABASE_URL || env.DIRECT_URL;
  const source = env.ADMIN_DATABASE_URL
    ? 'ADMIN_DATABASE_URL'
    : env.DIRECT_URL
      ? 'DIRECT_URL'
      : 'DATABASE_URL';

  if (!value) {
    if (protectedEnv) {
      throw new Error(
        'Administrative scripts require DIRECT_URL or ADMIN_DATABASE_URL not using the Supabase transaction pooler.',
      );
    }

    return env.DATABASE_URL || FALLBACK_LOCAL_DATABASE_URL;
  }

  let parsed: ParsedDatabaseUrl;
  try {
    parsed = parseDatabaseUrl(value);
  } catch {
    throw new Error(`${source} is not a valid PostgreSQL URL.`);
  }

  if (parsed.isTransactionPooler) {
    throw new Error(
      `${source} points to the Supabase transaction pooler (${describeDatabaseUrl(value)}). Administrative scripts require DIRECT_URL or ADMIN_DATABASE_URL not using the Supabase transaction pooler.`,
    );
  }

  return value;
}

export function assertAdministrativeDatabaseUrlMatchesProjectRef(input: {
  url: string;
  projectRef?: string;
}) {
  const projectRef = input.projectRef?.trim().toLowerCase();

  if (!projectRef) {
    throw new Error('SUPABASE_PROJECT_REF is required.');
  }

  const parsed = parseDatabaseUrl(input.url);
  const identity = `${parsed.host}/${parsed.username}`.toLowerCase();

  if (!identity.includes(projectRef)) {
    throw new Error(
      `Administrative database URL does not match SUPABASE_PROJECT_REF (${describeDatabaseUrl(input.url)}).`,
    );
  }
}
