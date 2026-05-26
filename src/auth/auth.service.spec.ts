import { Role, SystemMode, SystemType } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const tenant = {
    id: 'tenant-1',
    name: 'Empresa Teste',
    slug: 'empresa-teste',
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    createdAt: new Date(),
  };
  const branch = {
    id: 'branch-1',
    name: 'Matriz',
    slug: 'matriz',
  };
  const profile = {
    id: 'user-1',
    supabaseUserId: 'user-1',
    email: 'user@test.com',
    name: 'User Teste',
    fullName: 'User Teste',
    accessNameNormalized: 'user teste',
    role: Role.Admin,
    systemType: SystemType.padrao,
    allowedSystemTypes: [SystemType.padrao],
    isSuperAdmin: false,
    tenantId: tenant.id,
    primaryTenantId: tenant.id,
    createdAt: new Date(),
    memberships: [
      {
        tenantId: tenant.id,
        branchId: branch.id,
        role: Role.Admin,
        tenant,
        branch,
      },
    ],
  };

  const createPrisma = () => {
    const tx = {
      tenant: {
        create: jest.fn().mockResolvedValue(tenant),
        update: jest.fn().mockResolvedValue(tenant),
      },
      branch: {
        create: jest.fn().mockResolvedValue(branch),
        findFirst: jest.fn().mockResolvedValue(branch),
      },
      userProfile: {
        create: jest.fn().mockResolvedValue({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          createdAt: profile.createdAt,
        }),
        update: jest.fn().mockResolvedValue(profile),
      },
      tenantMember: {
        upsert: jest.fn().mockResolvedValue({ id: 'member-1' }),
      },
    };
    const prisma = {
      tx,
      userProfile: {
        findFirst: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          ...tenant,
          id: 'dev-tenant',
          name: 'NextStock Dev',
          slug: 'nextstock-dev',
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };

    return prisma as any;
  };

  const createSupabase = () =>
    ({
      anon: {
        auth: {
          signUp: jest.fn().mockResolvedValue({
            data: {
              user: { id: profile.id, email: profile.email },
              session: { access_token: 'register-token' },
            },
            error: null,
          }),
          signInWithPassword: jest.fn().mockResolvedValue({
            data: {
              user: { id: profile.id },
              session: { access_token: 'login-token' },
            },
            error: null,
          }),
        },
      },
      admin: {
        auth: {
          admin: {
            deleteUser: jest.fn(),
          },
        },
      },
    }) as any;

  it('cadastro cria auth, profile, tenant, branch Matriz e nao retorna senha', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue(null);
    const service = new AuthService(supabase, prisma);

    const result = await service.register({
      email: profile.email,
      name: profile.name,
      companyName: tenant.name,
      password: 'Senha123',
      systemType: 'padrao',
    });

    expect(supabase.anon.auth.signUp).toHaveBeenCalled();
    expect(prisma.tx.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: tenant.name, systemType: SystemType.padrao }),
      }),
    );
    expect(prisma.tx.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Matriz' }),
      }),
    );
    expect(result.payload.selectedBranch).toMatchObject({
      name: 'Matriz',
      tenantId: tenant.id,
      systemType: SystemType.padrao,
    });
    expect(JSON.stringify(result.payload)).not.toContain('Senha123');
  });

  it('login comum usa apenas email/senha e retorna a primeira filial automaticamente', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce(profile);
    const service = new AuthService(supabase, prisma);

    const result = await service.login({
      email: profile.email,
      password: 'Senha123',
    });

    expect(supabase.anon.auth.signInWithPassword).toHaveBeenCalledWith({
      email: profile.email,
      password: 'Senha123',
    });
    expect(result.payload).toMatchObject({
      redirectTo: 'produtos.html',
      selectedBranch: {
        id: branch.id,
        name: 'Matriz',
        tenantId: tenant.id,
        systemType: SystemType.padrao,
      },
    });
  });

  it('login superAdmin retorna filial dev padrao e redireciona para dev.html', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    const devBranch = { id: 'dev-branch', name: 'Matriz Dev', slug: 'matriz-dev' };
    const devTenant = {
      ...tenant,
      id: 'dev-tenant',
      name: 'NextStock Dev',
      slug: 'nextstock-dev',
    };
    const superProfile = {
      ...profile,
      id: 'super-1',
      role: Role.superAdmin,
      isSuperAdmin: true,
      memberships: [],
    };
    const refreshedSuperProfile = {
      ...superProfile,
      tenantId: devTenant.id,
      primaryTenantId: devTenant.id,
      memberships: [
        {
          tenantId: devTenant.id,
          branchId: devBranch.id,
          role: Role.Admin,
          tenant: devTenant,
          branch: devBranch,
        },
      ],
    };

    prisma.tenant.upsert.mockResolvedValue(devTenant);
    prisma.tx.tenant.update.mockResolvedValue(devTenant);
    prisma.tx.branch.findFirst.mockResolvedValue(devBranch);
    prisma.userProfile.findFirst
      .mockResolvedValueOnce(superProfile)
      .mockResolvedValueOnce(refreshedSuperProfile);

    const service = new AuthService(supabase, prisma);
    const result = await service.login({
      email: profile.email,
      password: 'Senha123',
    });

    expect(result.payload).toMatchObject({
      redirectTo: 'dev.html',
      selectedBranch: {
        name: 'Matriz Dev',
        tenantId: devTenant.id,
        systemType: SystemType.padrao,
      },
    });
    expect(Object.keys(result.payload)).not.toContain(
      'requires' + 'BranchSelection',
    );
  });
});
