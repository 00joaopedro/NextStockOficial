import { PrismaClient } from '@prisma/client';
import { assertMaintenanceEnvironment } from '../maintenance/guard';

async function main() {
  const state = assertMaintenanceEnvironment('privacy:report-pii');
  const prisma = new PrismaClient();
  const [profiles, employees, petClients, partners] = await Promise.all([
    prisma.userProfile.count(),
    prisma.employee.count(),
    prisma.petClient.count(),
    prisma.partner.count(),
  ]);
  console.log(
    JSON.stringify({
      ...state,
      countsOnly: true,
      profiles,
      employees,
      petClients,
      partners,
    }),
  );
  await prisma.$disconnect();
}

void main();
