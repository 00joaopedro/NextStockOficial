import { PrismaClient } from '@prisma/client';
import { assertMaintenanceEnvironment } from './guard';

async function main() {
  const state = assertMaintenanceEnvironment('audit:retention-report');
  const prisma = new PrismaClient();
  const rows = await prisma.securityAuditEvent.groupBy({
    by: ['severity', 'outcome'],
    _count: { _all: true },
  });
  const old = await prisma.securityAuditEvent.count({
    where: { createdAt: { lt: new Date(Date.now() - 730 * 86_400_000) } },
  });
  console.log(
    JSON.stringify({ ...state, groups: rows, olderThan730Days: old }),
  );
  await prisma.$disconnect();
}

void main();
