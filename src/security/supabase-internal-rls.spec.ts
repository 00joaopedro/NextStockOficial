import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('Supabase internal table RLS migration contract', () => {
  const migrationDir = join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260920000000_supabase_internal_tables_rls',
  );
  const migration = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
  const rollback = readFileSync(join(migrationDir, 'ROLLBACK.md'), 'utf8');
  const stagingCheck = readFileSync(
    join(process.cwd(), 'sql', 'audit', 'supabase_internal_rls_staging_verification.sql'),
    'utf8',
  );
  const migrationFiles = readdirSync(join(process.cwd(), 'prisma', 'migrations'))
    .filter((entry) => entry !== 'migration_lock.toml')
    .map((entry) => {
      try {
        return readFileSync(join(process.cwd(), 'prisma', 'migrations', entry, 'migration.sql'), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const tables = [
    '_prisma_migrations',
    'dev_workspaces',
    'billing_checkout_intents',
    'upload_quota_reservations',
    'upload_quota_counters',
    'user_provisionings',
    'user_provisioning_events',
    'auth_email_claims',
    'local_credentials',
    'password_reset_tokens',
    'auth_identities',
    'oauth_intents',
    'auth_migration_ledger',
  ];

  it('enables RLS and revokes Data API roles for each verified table idempotently', () => {
    for (const table of tables) expect(migration).toContain(`'${table}'`);
    expect(migration).toContain('to_regclass(');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE');
    expect(migration).toContain('FROM anon, authenticated');
  });

  it('uses only the established service_role policy and never forces RLS', () => {
    expect(migration).toContain('FOR ALL TO service_role USING (true) WITH CHECK (true)');
    expect(hasForceRlsCommand(migration)).toBe(false);
    expect(migration).not.toMatch(/TO\s+(anon|authenticated)\b/i);
    expect(migration).not.toMatch(/CREATE\s+POLICY[^;]*TO\s+PUBLIC\b/is);
  });

  it('ignores FORCE RLS wording in comments and detects executable FORCE RLS', () => {
    const commentOnly = '-- No FORCE ROW LEVEL SECURITY is used.';
    const executableForce = 'ALTER TABLE public.example FORCE ROW LEVEL SECURITY;';

    expect(stripSqlComments(commentOnly)).toBe(' ');
    expect(hasForceRlsCommand(commentOnly)).toBe(false);
    expect(hasForceRlsCommand(executableForce)).toBe(true);
  });

  it('documents rollback and read-only staging checks without application data access', () => {
    expect(rollback).toContain('DISABLE ROW LEVEL SECURITY');
    expect(rollback).toContain('GRANT ALL ON TABLE');
    expect(stagingCheck).toContain('relrowsecurity');
    expect(stagingCheck).toContain('relforcerowsecurity');
    expect(stagingCheck).toContain('pg_policies');
    expect(stagingCheck).toContain('has_table_privilege');
    expect(stagingCheck).not.toMatch(/\b(SELECT|FROM)\s+(profiles|tenants|orders)\b/i);
  });

  it('does not claim the untracked auth_intents table exists in versioned schema', () => {
    expect(schema).not.toContain('@@map("auth_intents")');
    expect(migration).not.toContain("'auth_intents'");
  });

  it('targets only tables found in the current Prisma schema or migration history', () => {
    for (const table of tables.filter((name) => name !== '_prisma_migrations')) {
      expect(schema.includes(`@@map("${table}")`) || migrationFiles.includes(`"${table}"`)).toBe(true);
    }
  });
});

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function hasForceRlsCommand(sql: string): boolean {
  const executableSql = stripSqlComments(sql);
  return /\bALTER\s+TABLE\b[^;]*?\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b(?=\s*;)/i.test(
    executableSql,
  );
}
