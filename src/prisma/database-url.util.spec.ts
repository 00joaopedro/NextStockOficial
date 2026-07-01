import { configurePrismaRuntimeUrl } from './database-url.util';

describe('configurePrismaRuntimeUrl', () => {
  const previousLimit = process.env.DATABASE_CONNECTION_LIMIT;

  afterEach(() => {
    if (previousLimit === undefined) delete process.env.DATABASE_CONNECTION_LIMIT;
    else process.env.DATABASE_CONNECTION_LIMIT = previousLimit;
  });

  it('configura Transaction Pooler 6543 para Prisma/PgBouncer', () => {
    const result = configurePrismaRuntimeUrl(
      'postgresql://postgres.project:secret@aws-0-region.pooler.supabase.com:6543/postgres',
    );
    const url = new URL(result as string);

    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('pgbouncer')).toBe('true');
    expect(url.searchParams.get('connection_limit')).toBe('1');
  });

  it('preserva e corrige parametros existentes da Transaction Pooler', () => {
    const result = configurePrismaRuntimeUrl(
      'postgresql://postgres.project:secret@aws-0-region.pooler.supabase.com:6543/postgres?schema=public&pgbouncer=false',
    );
    const url = new URL(result as string);

    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('pgbouncer')).toBe('true');
  });

  it('nao altera Session Pooler ou conexao direta', () => {
    const sessionPooler =
      'postgresql://postgres.project:secret@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require';

    expect(configurePrismaRuntimeUrl(sessionPooler)).toBe(sessionPooler);
  });

  it('permite limite pequeno parametrizado sem expor a URL', () => {
    process.env.DATABASE_CONNECTION_LIMIT = '4';
    const result = configurePrismaRuntimeUrl(
      'postgresql://user:secret@pooler.example.com:6543/postgres',
    );
    expect(new URL(result as string).searchParams.get('connection_limit')).toBe('4');
  });
});
