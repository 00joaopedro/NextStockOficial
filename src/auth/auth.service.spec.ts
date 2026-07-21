import { Logger } from '@nestjs/common';
import { Prisma, Role, SystemMode, SystemType } from '@prisma/client';
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
    isActive: true,
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
        findMany: jest.fn().mockResolvedValue([]),
      },
      userProfile: {
        upsert: jest.fn().mockResolvedValue({
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
        create: jest.fn().mockResolvedValue({ id: profile.id }),
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
            createUser: jest.fn().mockResolvedValue({
              data: {
                user: { id: profile.id, email: profile.email },
              },
              error: null,
            }),
            deleteUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
          },
        },
      },
    }) as any;

  const createDevWorkspaces = () =>
    {
      const devTenant = {
        ...tenant,
        id: 'dev-tenant-padrao',
        name: 'NextStock Dev Padrao',
        slug: 'nextstock-dev-padrao',
        systemType: SystemType.padrao,
        mode: SystemMode.padrao,
      };
      const devBranch = {
        ...branch,
        id: 'dev-branch-padrao',
        name: 'Matriz Dev Padrao',
        slug: 'matriz-dev-padrao',
      };

      return ({
      ensureDefaultWorkspaces: jest.fn().mockResolvedValue([]),
      ensureDefaultWorkspace: jest.fn().mockResolvedValue({
        tenant: devTenant,
        branch: devBranch,
        selectedBranch: {
          id: devBranch.id,
          name: devBranch.name,
          tenantId: devTenant.id,
          systemType: devTenant.systemType,
          isDevWorkspace: true,
        },
      }),
      listDefaultWorkspaces: jest.fn().mockResolvedValue([
        {
          systemType: devTenant.systemType,
          tenantId: devTenant.id,
          branchId: devBranch.id,
          tenant: devTenant,
          branch: devBranch,
        },
      ]),
      normalizeSystemType: jest.fn().mockReturnValue(SystemType.padrao),
      toBranchSummary: jest.fn().mockImplementation((workspace) => ({
        id: workspace.branch.id,
        name: workspace.branch.name,
        slug: workspace.branch.slug,
        tenantId: workspace.tenant.id,
        tenant: workspace.tenant,
        systemType: workspace.systemType,
        isDevWorkspace: true,
      })),
      }) as any;
    };

  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
  });

  it('cadastro cria auth, profile, tenant, branch Matriz e nao retorna senha', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue(null);
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    const result = await service.register({
      email: profile.email,
      name: profile.name,
      companyName: tenant.name,
      password: 'Senha123',
      systemType: 'padrao',
    });

    expect(supabase.admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: profile.email,
      password: 'Senha123',
      email_confirm: true,
      user_metadata: {
        name: profile.name,
        full_name: profile.name,
        companyName: tenant.name,
        systemType: SystemType.padrao,
        role: Role.Admin,
        access_name_normalized: profile.accessNameNormalized,
        allowed_system_types: [SystemType.padrao],
        is_super_admin: false,
        isSuperAdmin: false,
      },
    });
    expect(prisma.userProfile.findFirst).toHaveBeenCalledWith({
      where: { email: profile.email },
      select: { id: true },
    });
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
    expect(prisma.tx.tenantMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: tenant.id,
          userProfileId: profile.id,
          branchId: branch.id,
          role: Role.Admin,
        }),
      }),
    );
    expect(result.payload.selectedBranch).toMatchObject({
      name: 'Matriz',
      tenantId: tenant.id,
      systemType: SystemType.padrao,
    });
    expect(JSON.stringify(result.payload)).not.toContain('Senha123');
  });

  it('cadastro com referral usa systemType validado e cria atribuicao', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue(null);
    const referrals = {
      resolveActive: jest.fn().mockResolvedValue({
        partnerId: 'partner-1',
        systemType: SystemType.petshop,
      }),
      recordRejected: jest.fn(),
      createReferral: jest.fn().mockResolvedValue([]),
    };
    const service = new AuthService(
      supabase,
      prisma,
      createDevWorkspaces(),
      undefined,
      referrals as any,
    );

    await service.register({
      email: profile.email,
      name: profile.name,
      companyName: tenant.name,
      password: 'Senha123',
      systemType: 'padrao',
      referralCode: 'A'.repeat(43),
    });

    expect(prisma.tx.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ systemType: SystemType.petshop }),
      }),
    );
    expect(referrals.createReferral).toHaveBeenCalledWith(
      prisma.tx,
      expect.objectContaining({ partnerId: 'partner-1' }),
      expect.objectContaining({
        profileId: profile.id,
        tenantId: tenant.id,
        branchId: branch.id,
      }),
    );
  });

  it('cadastro novo cria trial na mesma transaction Prisma', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue(null);
    const subscriptions = {
      createTrial: jest.fn().mockResolvedValue({
        id: 'subscription-trial',
      }),
    };
    const service = new AuthService(
      supabase,
      prisma,
      createDevWorkspaces(),
      undefined,
      undefined,
      subscriptions as any,
    );

    await service.register({
      email: profile.email,
      name: profile.name,
      companyName: tenant.name,
      password: 'Senha123',
      systemType: 'padrao',
    });

    expect(subscriptions.createTrial).toHaveBeenCalledWith(
      prisma.tx,
      tenant.id,
    );
  });

  it('cadastro com email duplicado retorna 409 antes de criar auth', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue({ id: 'existing-profile' });
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(
      service.register({
        email: profile.email,
        name: profile.name,
        companyName: tenant.name,
        password: 'Senha123',
        systemType: 'padrao',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(supabase.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('cadastro mapeia erro Prisma P2002 para 409 e solicita rollback do Auth', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { modelName: 'UserProfile', target: ['email'] },
      }),
    );
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(
      service.register({
        email: profile.email,
        name: profile.name,
        companyName: tenant.name,
        password: 'Senha123',
        systemType: 'padrao',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(supabase.admin.auth.admin.deleteUser).toHaveBeenCalledWith(profile.id);
  });

  it('cadastro mapeia Prisma P2022 para 503 operacional, nao 500', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Column does not exist', {
        code: 'P2022',
        clientVersion: '6.19.3',
        meta: {
          modelName: 'UserProfile',
          column: 'profiles.allowed_system_types',
        },
      }),
    );
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(
      service.register({
        email: profile.email,
        name: profile.name,
        companyName: tenant.name,
        password: 'Senha123',
        systemType: 'padrao',
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(supabase.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('cadastro mapeia P2021 no lookup do slug para 503 antes de criar auth', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.tenant.findUnique.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Table does not exist', {
        code: 'P2021',
        clientVersion: '6.19.3',
        meta: { modelName: 'Tenant', table: 'public.tenants' },
      }),
    );
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(
      service.register({
        email: profile.email,
        name: profile.name,
        companyName: tenant.name,
        password: 'Senha123',
        systemType: 'padrao',
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(supabase.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('registra falha da compensacao Auth sem substituir o erro Prisma original', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma.userProfile.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    supabase.admin.auth.admin.deleteUser.mockResolvedValue({
      data: null,
      error: { code: 'provider_failure', message: 'sensitive provider detail' },
    });
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(
      service.register({
        email: profile.email,
        name: profile.name,
        companyName: tenant.name,
        password: 'Senha123',
        systemType: 'padrao',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(loggerSpy).toHaveBeenCalledWith(
      'Registration authentication rollback failed code=provider_failure',
    );
    expect(String(loggerSpy.mock.calls.flat())).not.toContain(
      'sensitive provider detail',
    );
    loggerSpy.mockRestore();
  });

  it('login comum usa apenas email/senha e retorna a primeira filial automaticamente', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce(profile);
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

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

  it('profile retorna user e selectedBranch explicito', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue(profile);
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(service.getProfile({ id: profile.id } as any)).resolves.toMatchObject({
      ok: true,
      user: {
        id: profile.id,
        tenantId: tenant.id,
        branchId: branch.id,
        systemType: SystemType.padrao,
      },
      selectedBranch: {
        id: branch.id,
        name: branch.name,
        tenantId: tenant.id,
        systemType: SystemType.padrao,
      },
    });
  });

  it('profile retorna branches com systemType real do tenant', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue(profile);
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(service.getProfile({ id: profile.id } as any)).resolves.toMatchObject({
      user: {
        branches: [
          {
            id: branch.id,
            tenantId: tenant.id,
            systemType: SystemType.padrao,
            tenant: {
              systemType: SystemType.padrao,
            },
          },
        ],
      },
    });
  });

  it('login escolhe membership coerente com systemType em vez do primeiro vinculo', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    const standardTenant = { ...tenant, id: 'tenant-standard', systemType: SystemType.padrao };
    const petTenant = { ...tenant, id: 'tenant-pet', systemType: SystemType.petshop, mode: SystemMode.petshop };
    const standardBranch = { ...branch, id: 'branch-standard' };
    const petBranch = { ...branch, id: 'branch-pet' };
    const multiProfile = {
      ...profile,
      tenantId: null,
      primaryTenantId: null,
      systemType: SystemType.petshop,
      allowedSystemTypes: [SystemType.petshop],
      memberships: [
        {
          tenantId: standardTenant.id,
          branchId: standardBranch.id,
          role: Role.Admin,
          tenant: standardTenant,
          branch: standardBranch,
        },
        {
          tenantId: petTenant.id,
          branchId: petBranch.id,
          role: Role.Admin,
          tenant: petTenant,
          branch: petBranch,
        },
      ],
    };
    const refreshedProfile = {
      ...multiProfile,
      memberships: [multiProfile.memberships[1]],
    };

    prisma.tx.tenant.update.mockResolvedValue(petTenant);
    prisma.tx.branch.findFirst.mockResolvedValue(petBranch);
    prisma.userProfile.findFirst
      .mockResolvedValueOnce(multiProfile)
      .mockResolvedValueOnce(refreshedProfile);
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    const result = await service.login({
      email: profile.email,
      password: 'Senha123',
    });

    expect(prisma.tx.tenant.update).not.toHaveBeenCalled();
    expect(prisma.tx.tenantMember.upsert).not.toHaveBeenCalled();
    expect(result.payload.selectedBranch).toMatchObject({
      id: petBranch.id,
      tenantId: petTenant.id,
      systemType: SystemType.petshop,
    });
  });

  it('usuario da branch B continua na branch B depois de novo login', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    const branchB = { ...branch, id: 'branch-b', name: 'Filial B', slug: 'filial-b' };
    const branchBProfile = {
      ...profile,
      memberships: [
        {
          ...profile.memberships[0],
          branchId: branchB.id,
          branch: branchB,
        },
      ],
    };
    prisma.userProfile.findFirst.mockResolvedValue(branchBProfile);
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    const result = await service.login({
      email: profile.email,
      password: 'Senha123',
    });

    expect(result.payload.selectedBranch).toMatchObject({
      id: branchB.id,
      name: branchB.name,
    });
    expect(prisma.tx.tenantMember.upsert).not.toHaveBeenCalled();
  });

  it('login com usuario Supabase sem profile retorna conflito e nunca concede superAdmin por metadata', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    supabase.anon.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'metadata-user',
          email: 'metadata@test.com',
          user_metadata: {
            role: Role.superAdmin,
            is_super_admin: true,
            systemType: SystemType.petshop,
          },
        },
        session: { access_token: 'login-token' },
      },
      error: null,
    });
    prisma.userProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...profile,
        id: 'metadata-user',
        supabaseUserId: 'metadata-user',
        email: 'metadata@test.com',
        role: Role.Comprador,
        isSuperAdmin: false,
        systemType: SystemType.padrao,
        allowedSystemTypes: [SystemType.padrao],
        tenantId: null,
        primaryTenantId: null,
        memberships: [],
      });
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(
      service.login({ email: 'metadata@test.com', password: 'Senha123' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.userProfile.create).not.toHaveBeenCalled();
  });

  it('login com senha errada retorna 401', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    supabase.anon.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(
      service.login({ email: profile.email, password: 'Senha123' }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('login com profile sem tenant/branch/member retorna 409', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    prisma.userProfile.findFirst.mockResolvedValue({
      ...profile,
      tenantId: null,
      primaryTenantId: null,
      memberships: [],
    });
    const service = new AuthService(supabase, prisma, createDevWorkspaces());

    await expect(
      service.login({ email: profile.email, password: 'Senha123' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('login superAdmin retorna filial dev padrao e redireciona para dev.html', async () => {
    process.env.DEV_SUPER_ADMIN_USER_IDS = 'super-1';
    const prisma = createPrisma();
    const supabase = createSupabase();
    const devBranch = {
      id: 'dev-branch',
      name: 'Matriz Dev',
      slug: 'matriz-dev',
      isActive: true,
    };
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

    const service = new AuthService(supabase, prisma, createDevWorkspaces());
    const result = await service.login({
      email: profile.email,
      password: 'Senha123',
    });

    expect(result.payload).toMatchObject({
      redirectTo: 'dev.html',
      selectedBranch: {
        name: 'Matriz Dev Padrao',
        tenantId: 'dev-tenant-padrao',
        systemType: SystemType.padrao,
      },
    });
    expect(Object.keys(result.payload)).not.toContain(
      'requires' + 'BranchSelection',
    );
  });

  it('superAdmin comum permanece no proprio tenant e nao recebe tenant Dev', async () => {
    const prisma = createPrisma();
    const supabase = createSupabase();
    const commonSuperAdmin = {
      ...profile,
      role: Role.superAdmin,
      isSuperAdmin: true,
    };

    prisma.userProfile.findFirst
      .mockResolvedValueOnce(commonSuperAdmin)
      .mockResolvedValueOnce(commonSuperAdmin);

    const service = new AuthService(supabase, prisma, createDevWorkspaces());
    const result = await service.login({
      email: profile.email,
      password: 'Senha123',
    });

    expect(prisma.tenant.upsert).not.toHaveBeenCalled();
    expect(result.payload).toMatchObject({
      redirectTo: 'produtos.html',
      selectedBranch: {
        id: branch.id,
        tenantId: tenant.id,
        systemType: SystemType.padrao,
      },
      user: {
        role: Role.superAdmin,
        isDevSuperAdmin: false,
        tenantId: tenant.id,
      },
    });
  });
});
