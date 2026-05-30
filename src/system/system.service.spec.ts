import { SystemType } from '@prisma/client';
import { SystemMode } from './enums/system-mode.enum';
import { TenantType } from './enums/tenant-type.enum';
import { SystemService } from './system.service';

describe('SystemService', () => {
  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
  });

  it('contexto sem usuario continua preview/demo', () => {
    const service = new SystemService();

    expect(service.getContext()).toMatchObject({
      systemMode: SystemMode.Preview,
      tenantType: TenantType.Standard,
    });
  });

  it('superAdmin comum nao recebe isDevSuperAdmin por padrao', () => {
    const service = new SystemService();

    expect(
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
    ).toMatchObject({
      systemMode: SystemMode.Production,
      tenantType: TenantType.Standard,
      isSuperAdmin: true,
      isDevSuperAdmin: false,
    });
  });

  it('Dev SuperAdmin em allowlist recebe isDevSuperAdmin', () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
    const service = new SystemService();

    expect(
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
    ).toMatchObject({
      isSuperAdmin: true,
      isDevSuperAdmin: true,
    });
  });
});
