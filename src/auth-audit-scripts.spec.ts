import { readFileSync } from 'fs';
import { join } from 'path';

describe('auth audit scripts', () => {
  const script = (file: string) =>
    readFileSync(join(__dirname, '..', 'scripts', 'auth', file), 'utf8');

  it('audit-user e dry-run por padrao e nao implementa reparo automatico', () => {
    const source = script('audit-user.ts');

    expect(source).toContain(
      "argv.includes('--dry-run') || !argv.includes('--apply')",
    );
    expect(source).toContain('dryRun: options.dryRun');
    expect(source).toContain('selectAdministrativeDatabaseUrl(process.env)');
    expect(source).not.toContain('--fix');
    expect(source).not.toContain('deleteUser');
    expect(source).not.toContain('updateMany');
  });

  it('audit-schema verifica migration, colunas criticas e enums sem db push', () => {
    const source = script('audit-schema.ts');

    expect(source).toContain('20260522013000_profile_super_admin_auth');
    expect(source).toContain('allowed_system_types');
    expect(source).toContain('tenant_members');
    expect(source).toContain('REQUIRED_ENUM_VALUES');
    expect(source).toContain('selectAdministrativeDatabaseUrl(process.env)');
    expect(source).toContain('requiredByCurrentSchema: false');
    expect(source).not.toContain('db push');
    expect(source).not.toContain('$executeRaw');
  });

  it('schema.prisma declara directUrl para Prisma migrate', () => {
    const source = readFileSync(
      join(__dirname, '..', 'prisma', 'schema.prisma'),
      'utf8',
    );

    expect(source).toContain('directUrl = env("DIRECT_URL")');
  });
});
