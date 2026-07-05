import { PrismaClient } from '@prisma/client';
import { assertMaintenanceEnvironment } from './guard';

async function main() {
  const state = assertMaintenanceEnvironment('sessions:cleanup');
  const prisma = new PrismaClient();
  const days = Math.max(30, Number(process.env.SESSION_RETENTION_DAYS || 120));
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const where = {
    OR: [
      { expiresAt: { lt: cutoff } },
      { revokedAt: { not: null as Date | null, lt: cutoff } },
    ],
  };
  const count = await prisma.userSession.count({ where });
  const deleted = state.dryRun
    ? 0
    : (await prisma.userSession.deleteMany({ where })).count;
  console.log(JSON.stringify({ ...state, cutoff, candidates: count, deleted }));
  await prisma.$disconnect();
}

void main();
