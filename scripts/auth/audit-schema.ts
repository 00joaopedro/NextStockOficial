import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  describeDatabaseUrl,
  selectAdministrativeDatabaseUrl,
} from '../lib/admin-database-url';

const REQUIRED_MIGRATIONS = [
  '20260520000000_auth_multitenant_alignment',
  '20260522013000_profile_super_admin_auth',
  '20260604010000_branch_isolation_hardening',
];

const REQUIRED_TABLES = ['profiles', 'tenants', 'branches', 'tenant_members'];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  profiles: [
    'id',
    'supabase_user_id',
    'email',
    'name',
    'access_name_normalized',
    'tenant_id',
    'primary_tenant_id',
    'system_type',
    'allowed_system_types',
    'is_super_admin',
  ],
  tenants: ['id', 'name', 'slug', 'system_type', 'mode'],
  branches: ['id', 'tenant_id', 'name', 'slug', 'is_active'],
  tenant_members: ['id', 'tenant_id', 'user_profile_id', 'branch_id', 'role'],
};

const INFORMATIONAL_COLUMNS: Record<string, string[]> = {
  profiles: ['branch_id'],
};

const REQUIRED_ENUM_VALUES: Record<string, string[]> = {
  SystemType: ['padrao', 'petshop'],
  SystemMode: ['visualizacao', 'padrao', 'petshop'],
  Role: ['superAdmin', 'Admin', 'Vendedor', 'Comprador'],
};

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

type TableRow = {
  table_name: string;
};

type ColumnRow = {
  table_name: string;
  column_name: string;
};

type EnumRow = {
  enum_name: string;
  enum_value: string;
};

async function main() {
  const administrativeUrl = selectAdministrativeDatabaseUrl(process.env);
  console.log(
    `Using administrative database connection (${describeDatabaseUrl(administrativeUrl)}).`,
  );
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: administrativeUrl,
      },
    },
  });

  try {
    const [migrations, tables, columns, enumValues] = await Promise.all([
      prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at
        FROM "_prisma_migrations"
        WHERE migration_name IN (${Prisma.join(REQUIRED_MIGRATIONS)})
      `,
      prisma.$queryRaw<TableRow[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
      `,
      prisma.$queryRaw<ColumnRow[]>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (${Prisma.join([
            ...new Set([
              ...Object.keys(REQUIRED_COLUMNS),
              ...Object.keys(INFORMATIONAL_COLUMNS),
            ]),
          ])})
      `,
      prisma.$queryRaw<EnumRow[]>`
        SELECT t.typname AS enum_name, e.enumlabel AS enum_value
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname IN (${Prisma.join(Object.keys(REQUIRED_ENUM_VALUES))})
        ORDER BY t.typname, e.enumsortorder
      `,
    ]);

    const migrationMap = new Map(
      migrations.map((migration) => [migration.migration_name, migration]),
    );
    const tableSet = new Set(tables.map((table) => table.table_name));
    const columnSet = new Set(
      columns.map((column) => `${column.table_name}.${column.column_name}`),
    );
    const enumMap = new Map<string, string[]>();
    for (const row of enumValues) {
      enumMap.set(row.enum_name, [
        ...(enumMap.get(row.enum_name) ?? []),
        row.enum_value,
      ]);
    }

    const report = {
      dryRun: true,
      migrations: REQUIRED_MIGRATIONS.map((name) => {
        const migration = migrationMap.get(name);

        return {
          name,
          applied: Boolean(migration?.finished_at && !migration.rolled_back_at),
          finishedAt: migration?.finished_at ?? null,
          rolledBackAt: migration?.rolled_back_at ?? null,
        };
      }),
      tables: REQUIRED_TABLES.map((name) => ({
        name,
        exists: tableSet.has(name),
      })),
      columns: Object.entries(REQUIRED_COLUMNS).flatMap(
        ([table, requiredColumns]) =>
          requiredColumns.map((column) => ({
            table,
            column,
            exists: columnSet.has(`${table}.${column}`),
            requiredByCurrentSchema: true,
          })),
      ),
      informationalColumns: Object.entries(INFORMATIONAL_COLUMNS).flatMap(
        ([table, informationalColumns]) =>
          informationalColumns.map((column) => ({
            table,
            column,
            exists: columnSet.has(`${table}.${column}`),
            requiredByCurrentSchema: false,
            note: 'Branch atual do usuario e resolvido por tenant_members.branch_id.',
          })),
      ),
      enums: Object.entries(REQUIRED_ENUM_VALUES).map(
        ([name, requiredValues]) => {
          const currentValues = enumMap.get(name) ?? [];

          return {
            name,
            exists: currentValues.length > 0,
            values: currentValues,
            requiredValues,
            missingValues: requiredValues.filter(
              (value) => !currentValues.includes(value),
            ),
          };
        },
      ),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Unknown schema audit error.';
  console.error(
    message.replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, '[REDACTED_DATABASE_URL]'),
  );
  process.exitCode = 1;
});
