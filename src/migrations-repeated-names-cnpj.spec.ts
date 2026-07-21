import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('migration de nomes repetidos e CNPJ unico', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260721000000_repeated_names_unique_tenant_cnpj/migration.sql',
    ),
    'utf8',
  );

  it('remove apenas a unicidade do nome normalizado do usuario', () => {
    expect(migration).toContain(
      'DROP INDEX IF EXISTS "profiles_access_name_normalized_key"',
    );
  });

  it('interrompe a migration diante de CNPJs normalizados duplicados', () => {
    expect(migration).toContain('HAVING COUNT(*) > 1');
    expect(migration).toContain(
      "RAISE EXCEPTION 'Cannot enforce unique tenant CNPJ: normalized duplicates exist'",
    );
  });

  it('normaliza e cria indice unico para CNPJ da empresa', () => {
    expect(migration).toContain('regexp_replace');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "tenants_cnpj_key" ON "tenants"("cnpj")',
    );
  });
});
