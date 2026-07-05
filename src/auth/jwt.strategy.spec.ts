jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

import { EmployeeStatus, Role, SystemMode, SystemType } from '@prisma/client';
import { cookieExtractor, decodeJwtHeader, JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const tenant = {
    id: 'tenant-id',
    name: 'Empresa',
    slug: 'empresa',
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
  };
  const branch = {
    id: 'branch-id',
    name: 'Matriz',
    slug: 'matriz',
  };
  const profile = {
    id: 'profile-id',
    supabaseUserId: 'auth-user-id',
    email: 'user@test.com',
    name: 'User Teste',
    fullName: 'User Teste',
    role: Role.Admin,
    systemType: SystemType.padrao,
    allowedSystemTypes: [SystemType.padrao],
    isSuperAdmin: false,
    tenantId: tenant.id,
    primaryTenantId: tenant.id,
    memberships: [
      {
        id: 'member-id',
        tenantId: tenant.id,
        branchId: branch.id,
        role: Role.Admin,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        tenant,
        branch: { ...branch, isActive: true },
      },
    ],
  };

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
    process.env.SESSION_ENFORCEMENT_ENABLED = 'false';
  });

  const createDevWorkspaces = (workspaces: any[] = []) =>
    ({
      listDefaultWorkspaces: jest.fn().mockResolvedValue(workspaces),
    }) as any;

  it('cookieExtractor extrai req.cookies.jwt', () => {
    expect(cookieExtractor({ cookies: { jwt: 'abc.def.ghi' } } as any)).toBe(
      'abc.def.ghi',
    );
  });

  it('decodeJwtHeader le algoritmo sem expor token completo', () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');

    expect(decodeJwtHeader(`${header}.payload.signature`)).toMatchObject({
      alg: 'HS256',
      typ: 'JWT',
    });
  });

  it('validate aceita payload com sub/email e retorna usuario autenticado', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue(profile),
        update: jest.fn(),
      },
    };
    const strategy = new JwtStrategy(prisma as any, createDevWorkspaces());

    await expect(
      strategy.validate({ sub: 'auth-user-id', email: 'user@test.com' }),
    ).resolves.toMatchObject({
      id: profile.id,
      tenantId: tenant.id,
      branchId: branch.id,
      systemType: SystemType.padrao,
    });
  });

  it('consulta a sessao opaca antes de autorizar o JWT', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue(profile),
        update: jest.fn(),
      },
    };
    const sessions = {
      assertActive: jest.fn().mockResolvedValue({ id: 'session-1' }),
    };
    const strategy = new JwtStrategy(
      prisma as any,
      createDevWorkspaces(),
      sessions as any,
    );
    await strategy.validate(
      { cookies: { nextstock_session: 'opaque' } },
      { sub: 'auth-user-id', email: 'user@test.com' },
    );
    expect(sessions.assertActive).toHaveBeenCalledWith('opaque', profile.id);
  });

  it('validate escolhe membership coerente com systemType em vez do primeiro vinculo', async () => {
    const standardTenant = {
      ...tenant,
      id: 'tenant-standard',
      systemType: SystemType.padrao,
    };
    const petTenant = {
      ...tenant,
      id: 'tenant-pet',
      slug: 'pet-shop',
      systemType: SystemType.petshop,
      mode: SystemMode.petshop,
    };
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          tenantId: null,
          primaryTenantId: null,
          systemType: SystemType.petshop,
          allowedSystemTypes: [SystemType.petshop],
          memberships: [
            {
              id: 'member-standard',
              tenantId: standardTenant.id,
              branchId: 'branch-standard',
              role: Role.Admin,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              tenant: standardTenant,
              branch: {
                id: 'branch-standard',
                name: 'Matriz Padrao',
                slug: 'matriz',
                isActive: true,
              },
            },
            {
              id: 'member-pet',
              tenantId: petTenant.id,
              branchId: 'branch-pet',
              role: Role.Admin,
              createdAt: new Date('2026-01-02T00:00:00.000Z'),
              tenant: petTenant,
              branch: {
                id: 'branch-pet',
                name: 'Matriz Pet',
                slug: 'matriz',
                isActive: true,
              },
            },
          ],
        }),
        update: jest.fn(),
      },
    };
    const strategy = new JwtStrategy(prisma as any, createDevWorkspaces());

    await expect(
      strategy.validate({ sub: 'auth-user-id', email: 'user@test.com' }),
    ).resolves.toMatchObject({
      tenantId: petTenant.id,
      branchId: 'branch-pet',
      systemType: SystemType.petshop,
      branches: expect.arrayContaining([
        expect.objectContaining({
          id: 'branch-pet',
          tenantId: petTenant.id,
          systemType: SystemType.petshop,
        }),
      ]),
    });
  });

  it('validate vincula profile encontrado por email quando supabaseUserId esta ausente', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          supabaseUserId: null,
          email: 'user@test.com',
        }),
        update: jest.fn().mockResolvedValue({ id: profile.id }),
      },
    };
    const strategy = new JwtStrategy(prisma as any, createDevWorkspaces());

    await strategy.validate({ sub: 'auth-user-id', email: 'user@test.com' });

    expect(prisma.userProfile.update).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: { supabaseUserId: 'auth-user-id' },
      select: { id: true },
    });
  });

  it('validate nao bloqueia superAdmin sem tenant/membership como usuario comum', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          supabaseUserId: 'super-auth-id',
          email: 'dev@test.com',
          role: Role.superAdmin,
          isSuperAdmin: true,
          tenantId: null,
          primaryTenantId: null,
          memberships: [],
        }),
        update: jest.fn(),
      },
    };
    const strategy = new JwtStrategy(prisma as any, createDevWorkspaces());

    await expect(
      strategy.validate({ sub: 'super-auth-id', email: 'dev@test.com' }),
    ).resolves.toMatchObject({
      role: Role.superAdmin,
      isSuperAdmin: true,
      isDevSuperAdmin: false,
      tenantId: null,
    });
  });

  it('validate marca isDevSuperAdmin apenas quando superAdmin esta na allowlist', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@test.com';
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          supabaseUserId: 'super-auth-id',
          role: Role.superAdmin,
          isSuperAdmin: true,
          email: 'dev@test.com',
          tenantId: null,
          primaryTenantId: null,
          memberships: [],
        }),
        update: jest.fn(),
      },
    };
    const strategy = new JwtStrategy(prisma as any, createDevWorkspaces());

    await expect(
      strategy.validate({ sub: 'super-auth-id', email: 'dev@test.com' }),
    ).resolves.toMatchObject({
      role: Role.superAdmin,
      isSuperAdmin: true,
      isDevSuperAdmin: true,
    });
  });

  it('rejeita profile com supabaseUserId diferente do JWT', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          supabaseUserId: 'different-auth-user',
        }),
        update: jest.fn(),
      },
    };
    const strategy = new JwtStrategy(prisma as any, createDevWorkspaces());

    await expect(
      strategy.validate({ sub: 'auth-user-id', email: profile.email }),
    ).rejects.toThrow('PROFILE_BINDING_MISMATCH');
    expect(prisma.userProfile.update).not.toHaveBeenCalled();
  });

  it('rejeita funcionario inativo mesmo com JWT valido', async () => {
    const prisma = {
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({
          ...profile,
          employee: {
            status: EmployeeStatus.inactive,
            dismissalDate: null,
            deletedAt: null,
          },
        }),
        update: jest.fn(),
      },
    };
    const strategy = new JwtStrategy(prisma as any, createDevWorkspaces());

    await expect(
      strategy.validate({ sub: 'auth-user-id', email: profile.email }),
    ).rejects.toThrow('EMPLOYEE_INACTIVE');
  });
});
