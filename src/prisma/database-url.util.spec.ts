import { configurePrismaRuntimeUrl } from './database-url.util';

describe('configurePrismaRuntimeUrl', () => {
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
});
