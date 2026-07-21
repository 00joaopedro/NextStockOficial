import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  SubscriptionStatus,
  SystemMode,
  SystemType,
} from '@prisma/client';
import { ProfileService } from './profile.service';

describe('ProfileService production rules', () => {
  const context = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    role: Role.Admin,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    isDevSuperAdmin: false,
    contextKind: 'normal',
  };
  const plan = {
    id: 'plan-a',
    name: 'Ouro',
    slug: 'ouro',
    priceCents: 20000,
    description: 'Plano Ouro',
    isActive: true,
  };
  const tenant = {
    id: 'tenant-a',
    name: 'Empresa A',
    cnpj: null,
    contactEmail: null,
    contactPhone: null,
    mode: SystemMode.padrao,
    systemType: SystemType.padrao,
    currentPlan: plan,
  };

  function setup() {
    const prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-a',
          fullName: 'Usuario A',
          name: 'Usuario A',
          email: 'usuario@example.com',
          role: Role.Admin,
          systemType: SystemType.padrao,
          allowedSystemTypes: [SystemType.padrao],
          isSuperAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue(tenant),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(tenant),
      },
      plan: {
        findMany: jest.fn().mockResolvedValue([plan]),
        findUnique: jest.fn().mockResolvedValue(plan),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const tenantContext = {
      resolve: jest.fn().mockResolvedValue(context),
    };

    return {
      prisma,
      tenantContext,
      service: new ProfileService(prisma as any, tenantContext as any),
    };
  }

  it('separa atualizacao do perfil pessoal dos dados da empresa', async () => {
    const { service, prisma } = setup();

    await service.updateMe(
      { id: 'user-a' } as any,
      { fullName: 'Novo Nome' },
      'branch-a',
    );

    expect(prisma.userProfile.update).toHaveBeenCalledWith({
      where: { id: 'user-a' },
      data: { fullName: 'Novo Nome', name: 'Novo Nome' },
    });
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('bloqueia alteracao direta de plano e nao atualiza o tenant', async () => {
    const { service, prisma } = setup();

    await expect(
      service.updatePlan(
        { id: 'user-a' } as any,
        'ouro',
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('prioriza subscription efetiva ao exibir plano atual', async () => {
    const { service, prisma } = setup();
    prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-a',
      status: SubscriptionStatus.active,
      provider: 'provider',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      trialEndsAt: null,
      canceledAt: null,
      plan: { ...plan, name: 'Diamante', slug: 'diamante' },
    });

    await expect(
      service.getSubscription({ id: 'user-a' } as any, 'branch-a'),
    ).resolves.toMatchObject({
      currentPlan: { name: 'Diamante', slug: 'diamante' },
      checkoutAvailable: false,
    });
  });

  it('rejeita CNPJ invalido antes de persistir', async () => {
    const { service, prisma } = setup();

    await expect(
      service.updateCompany(
        { id: 'user-a' } as any,
        { cnpj: '11.111.111/1111-11' },
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('rejeita CNPJ ja vinculado a outra empresa', async () => {
    const { service, prisma } = setup();
    prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-b' });

    await expect(
      service.updateCompany(
        { id: 'user-a' } as any,
        { cnpj: '11.222.333/0001-81' },
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith({
      where: { id: { not: 'tenant-a' }, cnpj: '11222333000181' },
      select: { id: true },
    });
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('converte corrida da constraint unica de CNPJ em conflito', async () => {
    const { service, prisma } = setup();
    prisma.tenant.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { modelName: 'Tenant', target: ['cnpj'] },
      }),
    );

    await expect(
      service.updateCompany(
        { id: 'user-a' } as any,
        { cnpj: '11.222.333/0001-81' },
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propaga somente solicitacao explicita de suporte Dev', async () => {
    const { service, tenantContext } = setup();

    await service.getCompany(
      { id: 'user-a' } as any,
      'branch-a',
      'support',
    );

    expect(tenantContext.resolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowDevSupport: true }),
    );
  });
});
