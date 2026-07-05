import { PrismaClient } from '@prisma/client';
import { assertMaintenanceEnvironment } from '../maintenance/guard';

async function main() {
  const state = assertMaintenanceEnvironment('privacy:report-retention');
  const prisma = new PrismaClient();
  const cutoff = new Date(Date.now() - 90 * 86_400_000);
  const [usageEvents, revokedSessions, deletedFiles] = await Promise.all([
    prisma.userUsageEvent.count({ where: { createdAt: { lt: cutoff } } }),
    prisma.userSession.count({ where: { revokedAt: { lt: cutoff } } }),
    prisma.storedFile.count({ where: { deletedAt: { lt: cutoff } } }),
  ]);
  console.log(
    JSON.stringify({
      ...state,
      cutoff,
      candidatesOnly: true,
      usageEvents,
      revokedSessions,
      deletedFiles,
    }),
  );
  await prisma.$disconnect();
}

void main();
