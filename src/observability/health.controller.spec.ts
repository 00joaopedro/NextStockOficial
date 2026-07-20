import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const requiredTables = [
    'tenants',
    'branches',
    'profiles',
    'tenant_members',
    'security_audit_events',
  ];

  it('reports ready only when the required schema is present', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue(
          requiredTables.map((table_name) => ({ table_name })),
        ),
    };
    const controller = new HealthController(prisma as any);

    await expect(controller.readiness()).resolves.toEqual({
      status: 'ready',
      database: 'available',
      schema: 'compatible',
    });
  });

  it('rejects readiness when an essential table is missing', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue(
          requiredTables
            .filter((table) => table !== 'tenants')
            .map((table_name) => ({ table_name })),
        ),
    };
    const controller = new HealthController(prisma as any);

    await expect(controller.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects readiness when the database cannot be queried', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection failed')),
    };
    const controller = new HealthController(prisma as any);

    await expect(controller.readiness()).rejects.toMatchObject({ status: 503 });
  });
});
