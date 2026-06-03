import { SystemType } from '@prisma/client';
import { SystemMode } from './enums/system-mode.enum';
import { TenantType } from './enums/tenant-type.enum';
import { SystemService } from './system.service';

describe('SystemService', () => {
  const prisma = {
    branch: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
    prisma.branch.findFirst.mockReset();
  });

  it('contexto sem usuario continua preview/demo', async () => {
    const service = new SystemService(prisma as any);

    await expect(service.getContext()).resolves.toMatchObject({
      systemMode: SystemMode.Preview,
      tenantType: TenantType.Standard,
    });
  });

  it('superAdmin comum nao recebe isDevSuperAdmin por padrao', async () => {
    const service = new SystemService(prisma as any);

    await expect(
      service.getContext({
        id: 'super-id',
        email: 'super@example.com',
        role: 'superAdmin',
        roles: ['superAdmin'],
        isSuperAdmin: true,
        is_super_admin: true,
        tenantId: null,
        tenant: null,
        branchId: null,
        branch: null,
        name: 'Super',
        systemType: SystemType.padrao,
      } as any),
    ).resolves.toMatchObject({
      systemMode: SystemMode.Production,
      tenantType: TenantType.Standard,
      isSuperAdmin: true,
      isDevSuperAdmin: false,
    });
  });

  it('Dev SuperAdmin em allowlist recebe isDevSuperAdmin', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
    const service = new SystemService(prisma as any);

    await expect(
      service.getContext({
        id: 'dev-id',
        email: 'dev@example.com',
        role: 'superAdmin',
        roles: ['superAdmin'],
        isSuperAdmin: true,
        is_super_admin: true,
        tenantId: null,
        tenant: null,
        branchId: null,
        branch: null,
        name: 'Dev',
        systemType: SystemType.padrao,
      } as any),
    ).resolves.toMatchObject({
      isSuperAdmin: true,
      isDevSuperAdmin: true,
    });
  });

  it('superAdmin com filial Pet Shop selecionada recebe contexto Pet Shop real', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-pet',
      name: 'Matriz',
      slug: 'matriz',
      tenantId: 'tenant-pet',
      tenant: {
        id: 'tenant-pet',
        name: 'Pet Shop',
        slug: 'pet-shop',
        systemType: SystemType.petshop,
        mode: 'petshop',
      },
    });
    const service = new SystemService(prisma as any);

    await expect(
      service.getContext(
        {
          id: 'dev-id',
          email: 'dev@example.com',
          role: 'superAdmin',
          roles: ['superAdmin'],
          isSuperAdmin: true,
          is_super_admin: true,
          tenantId: null,
          tenant: null,
          branchId: null,
          branch: null,
          name: 'Dev',
          systemType: SystemType.padrao,
        } as any,
        'branch-pet',
      ),
    ).resolves.toMatchObject({
      systemMode: SystemMode.Production,
      tenantType: TenantType.Petshop,
      selectedBranch: {
        id: 'branch-pet',
        tenantId: 'tenant-pet',
        systemType: SystemType.petshop,
      },
    });
  });
});
