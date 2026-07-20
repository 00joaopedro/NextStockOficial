import { Prisma, PrismaClient } from '@prisma/client';

export const ESSENTIAL_TABLES = [
  'tenants',
  'branches',
  'profiles',
  'tenant_members',
  'security_audit_events',
] as const;

export async function verifyEssentialSchema(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join(ESSENTIAL_TABLES)})
  `;
  const existing = new Set(tables.map((row) => row.table_name));
  const missing = ESSENTIAL_TABLES.filter((table) => !existing.has(table));

  if (missing.length) {
    throw new Error(
      `Essential schema audit failed; missing tables: ${missing.join(', ')}.`,
    );
  }

  return { tables: [...ESSENTIAL_TABLES] };
}
