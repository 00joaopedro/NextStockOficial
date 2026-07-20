import { PrismaClient } from '@prisma/client';
import { selectAdministrativeDatabaseUrl } from '../lib/admin-database-url';

export const INTERNAL_RECEIPT_ENUM_MIGRATION =
  '20260701010000_internal_receipt_status';

type MigrationRow = {
  migration_name: string;
  started_at: Date;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs: string | null;
};

export type MigrationInspection = {
  hasMigrationTable: boolean;
  failed: MigrationRow[];
  internalReceiptEnumExists: boolean;
};

export function administrativePrisma(env = process.env) {
  return new PrismaClient({
    datasources: {
      db: { url: selectAdministrativeDatabaseUrl(env) },
    },
  });
}

export async function inspectMigrationState(
  prisma: PrismaClient,
): Promise<MigrationInspection> {
  const [migrationTable] = await prisma.$queryRaw<
    Array<{ migration_table: string | null }>
  >`SELECT to_regclass('public._prisma_migrations')::text AS migration_table`;
  const [enumValue] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'SaleDocumentStatus'
        AND e.enumlabel = 'internal_issued'
    ) AS exists
  `;

  if (!migrationTable?.migration_table) {
    return {
      hasMigrationTable: false,
      failed: [],
      internalReceiptEnumExists: Boolean(enumValue?.exists),
    };
  }

  const rows = await prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name, started_at, finished_at, rolled_back_at, logs
    FROM public."_prisma_migrations"
    WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
    ORDER BY started_at
  `;

  return {
    hasMigrationTable: true,
    failed: rows,
    internalReceiptEnumExists: Boolean(enumValue?.exists),
  };
}

export function sanitizeCommandOutput(value: string) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 1_000);
}
