import { PrismaClient } from '@prisma/client';
import { assertMaintenanceEnvironment } from './guard';

async function main() {
  const state = assertMaintenanceEnvironment('uploads:quota-report');
  const prisma = new PrismaClient();
  const [rows, tenants] = await Promise.all([
    prisma.storedFile.groupBy({
      by: ['tenantId', 'branchId', 'status'],
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.tenant.findMany({
      select: { id: true, currentPlan: { select: { slug: true } } },
    }),
  ]);
  const plans = new Map(
    tenants.map((tenant) => [tenant.id, tenant.currentPlan?.slug || null]),
  );
  console.log(
    JSON.stringify({
      ...state,
      groups: rows.map((row) => ({
        ...row,
        plan: plans.get(row.tenantId) || null,
        bytes: row._sum.sizeBytes?.toString() || '0',
        _sum: undefined,
      })),
    }),
  );
  await prisma.$disconnect();
}

void main();
