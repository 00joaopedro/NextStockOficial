import { PrismaClient } from '@prisma/client';
import { assertMaintenanceEnvironment } from './guard';

async function main() {
  const state = assertMaintenanceEnvironment('storage:orphan-report');
  const prisma = new PrismaClient();
  const rows = await prisma.storedFile.groupBy({
    by: ['tenantId', 'module', 'status'],
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });
  console.log(
    JSON.stringify({
      ...state,
      note: 'Report compares inventory state only; Supabase bucket listing must be reconciled by an environment-specific operator.',
      groups: rows.map((row) => ({
        ...row,
        _sum: { sizeBytes: row._sum.sizeBytes?.toString() || '0' },
      })),
    }),
  );
  await prisma.$disconnect();
}

void main();
