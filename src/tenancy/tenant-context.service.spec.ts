import { ForbiddenException } from '@nestjs/common';
import { Role, SystemMode, SystemType } from '@prisma/client';
import { TenantContextService } from './tenant-context.service';

function user(overrides: Partial<Express.AuthenticatedUser> = {}): Express.AuthenticatedUser {
  return {
    id: 'user-a',
    email: 'admin@a.test',
    name: 'Admin A',
    role: Role.Admin,
    roles: [Role.Admin],
    tenantId: 'tenant-a',
    primaryTenantId: 'tenant-a',
    tenant: null,
    branchId: 'branch-a',
    branch: null,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    branches: [],
    ...overrides,
  };
}

function prismaMock() {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-a',
        systemType: SystemType.padrao,
        mode: SystemMode.padrao,
      }),
    },
    branch: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'branch-a'
            ? {
                id: 'branch-a',
                tenantId: 'tenant-a',
                tenant: {
                  id: 'tenant-a',
                  systemType: SystemType.padrao,
                  mode: SystemMode.padrao,
                },
              }
            : {
                id: 'branch-b',
                tenantId: 'tenant-b',
                tenant: {
                  id: 'tenant-b',
                  systemType: SystemType.petshop,
                  mode: SystemMode.petshop,
                },
              },
        ),
      ),
    },
  };
}

describe('TenantContextService', () => {
  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
  });

  it('bloqueia branch de outro tenant para usuario comum', async () => {
    const service = new TenantContextService(prismaMock() as any);

    await expect(
      service.resolve(user(), { selectedBranchId: 'branch-b', requireBranch: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia mutation em tenant visualizacao', async () => {
    const prisma = prismaMock();
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-a',
      tenantId: 'tenant-a',
      tenant: {
        id: 'tenant-a',
        systemType: SystemType.padrao,
        mode: SystemMode.visualizacao,
      },
    });
    const service = new TenantContextService(prisma as any);

    await expect(service.resolve(user(), { writable: true })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('superAdmin comum nao recebe acesso cross-tenant', async () => {
    const service = new TenantContextService(prismaMock() as any);

    await expect(
      service.resolve(
        user({
          role: Role.superAdmin,
          roles: [Role.superAdmin],
          isSuperAdmin: true,
          tenantId: null,
          primaryTenantId: null,
          branchId: null,
        }),
        { selectedBranchId: 'branch-b' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Dev SuperAdmin allowlisted acessa somente com branch real validada', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@test.com';
    const service = new TenantContextService(prismaMock() as any);

    await expect(
      service.resolve(
        user({
          email: 'dev@test.com',
          role: Role.superAdmin,
          roles: [Role.superAdmin],
          isSuperAdmin: true,
          tenantId: null,
          primaryTenantId: null,
          branchId: null,
        }),
        { selectedBranchId: 'branch-b', requireBranch: true },
      ),
    ).resolves.toMatchObject({
      tenantId: 'tenant-b',
      branchId: 'branch-b',
      isDevSuperAdmin: true,
    });
  });
});
