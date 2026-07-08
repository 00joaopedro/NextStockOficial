import {
  describeDatabaseUrl,
  selectAdministrativeDatabaseUrl,
} from '../scripts/lib/admin-database-url';
import { validateMigrationTarget } from '../scripts/migrations/validate-target-lib';

describe('administrative database URL guardrails', () => {
  const databaseUrl =
    'postgresql://postgres.project:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require';
  const directUrl =
    'postgresql://postgres.project:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require';

  it('rejeita DIRECT_URL ausente em production', () => {
    expect(() =>
      validateMigrationTarget({
        APP_ENV: 'production',
        DATABASE_URL: databaseUrl,
        SUPABASE_PROJECT_REF: 'project',
        PRODUCTION_SUPABASE_PROJECT_REF: 'project',
      }),
    ).toThrow('DIRECT_URL or ADMIN_DATABASE_URL is required');
  });

  it('rejeita DIRECT_URL apontando para transaction pooler 6543', () => {
    expect(() =>
      validateMigrationTarget({
        APP_ENV: 'production',
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        SUPABASE_PROJECT_REF: 'project',
        PRODUCTION_SUPABASE_PROJECT_REF: 'project',
      }),
    ).toThrow('Supabase transaction pooler');
  });

  it('aceita ADMIN_DATABASE_URL compativel e sanitiza descricao', () => {
    const result = validateMigrationTarget({
      APP_ENV: 'production',
      DATABASE_URL: databaseUrl,
      ADMIN_DATABASE_URL: directUrl,
      SUPABASE_PROJECT_REF: 'project',
      PRODUCTION_SUPABASE_PROJECT_REF: 'project',
    });

    expect(result.targetDescription).toBe(
      'host=aws-1-sa-east-1.pooler.supabase.com port=5432 database=postgres',
    );
    expect(result.targetDescription).not.toContain('secret');
  });

  it('scripts administrativos abortam em production se so houver DATABASE_URL pooler', () => {
    expect(() =>
      selectAdministrativeDatabaseUrl({
        APP_ENV: 'production',
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow(
      'Administrative scripts require DIRECT_URL or ADMIN_DATABASE_URL not using the Supabase transaction pooler.',
    );
  });

  it('descricao de URL nunca inclui usuario ou senha', () => {
    const description = describeDatabaseUrl(directUrl);

    expect(description).toContain('host=aws-1-sa-east-1.pooler.supabase.com');
    expect(description).toContain('port=5432');
    expect(description).toContain('database=postgres');
    expect(description).not.toContain('postgres.project');
    expect(description).not.toContain('secret');
  });
});
