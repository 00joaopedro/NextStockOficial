import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AgendaPetStatus, Role, SystemMode, SystemType } from '@prisma/client';
import { PetClientsService } from './pet-clients.service';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'admin@pet.com',
    name: 'Admin Pet',
    role: Role.Admin,
    roles: [Role.Admin],
    tenantId: 'tenant-pet',
    primaryTenantId: 'tenant-pet',
    tenant: null,
    branchId: 'branch-pet',
    branch: null,
    systemType: 'petshop',
    mode: 'petshop',
    ...overrides,
  };
}

function prismaMock() {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-pet',
        systemType: SystemType.petshop,
        mode: SystemMode.petshop,
      }),
    },
    branch: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'branch-pet',
        tenantId: 'tenant-pet',
        tenant: {
          id: 'tenant-pet',
          systemType: SystemType.petshop,
          mode: SystemMode.petshop,
        },
      }),
    },
    tenantMember: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'member-pet',
        role: Role.Admin,
        tenantId: 'tenant-pet',
        branchId: 'branch-pet',
        branch: {
          id: 'branch-pet',
          tenantId: 'tenant-pet',
          isActive: true,
        },
      }),
    },
    devWorkspace: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.branchId === 'branch-pet'
            ? {
                id: 'workspace-pet',
                systemType: SystemType.petshop,
                tenantId: 'tenant-pet',
                branchId: 'branch-pet',
                tenant: {
                  id: 'tenant-pet',
                  systemType: SystemType.petshop,
                  mode: SystemMode.petshop,
                },
                branch: {
                  id: 'branch-pet',
                  tenantId: 'tenant-pet',
                  isActive: true,
                },
              }
            : null,
        ),
      ),
    },
    petClient: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'client-1',
        tenantId: 'tenant-pet',
        branchId: 'branch-pet',
        name: 'Cliente',
        phone: '999',
        address: {},
        pets: [],
      }),
      create: jest.fn().mockResolvedValue({
        id: 'client-1',
        tenantId: 'tenant-pet',
        branchId: 'branch-pet',
        name: 'Cliente',
        phone: '999',
        address: {},
        pets: [],
      }),
      update: jest.fn().mockResolvedValue({
        id: 'client-1',
        tenantId: 'tenant-pet',
        branchId: 'branch-pet',
        name: 'Cliente 2',
        phone: '999',
        address: {},
        pets: [],
      }),
    },
    pet: {
      updateMany: jest.fn(),
    },
    agendaPet: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'agenda-1',
          tenantId: 'tenant-pet',
          branchId: 'branch-pet',
          clientId: 'client-1',
          petId: 'pet-1',
          cliente: 'Cliente',
          animal: 'Thor',
          atendente: 'Ana',
          servico: 'Banho',
          data: new Date('2026-06-10T13:00:00.000Z'),
          hora: '10:00',
          preco: 80,
          descricao: 'Banho',
          notes: 'Banho',
          status: AgendaPetStatus.canceled,
          startAt: new Date('2026-06-10T13:00:00.000Z'),
          endAt: new Date('2026-06-10T14:00:00.000Z'),
          canceledAt: new Date('2026-06-10T12:00:00.000Z'),
          cancellationReason: 'Cliente remarcou',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  };
}

describe('PetClientsService', () => {
  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';
  });
  it('cria cliente Pet com usuario Pet Shop autenticado no tenant correto', async () => {
    const prisma = prismaMock();
    const service = new PetClientsService(prisma as any);

    const result = await service.create(user(), {
      name: 'Maria',
      phone: '999',
      address: { bairro: 'Centro' },
    });

    expect(result.client).toMatchObject({ name: 'Cliente', tenantId: 'tenant-pet' });
    expect(prisma.petClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-pet',
          branchId: 'branch-pet',
          name: 'Maria',
        }),
      }),
    );
  });

  it('lista clientes apenas do tenant autenticado', async () => {
    const prisma = prismaMock();
    const service = new PetClientsService(prisma as any);

    await service.findAll(user(), { search: 'maria', page: 1, pageSize: 20 });

    expect(prisma.petClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-pet',
          branchId: 'branch-pet',
          deletedAt: null,
        }),
      }),
    );
  });

  it('bloqueia usuario sem JWT', async () => {
    const service = new PetClientsService(prismaMock() as any);

    await expect(service.findAll(undefined, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('bloqueia usuario do modo padrao', async () => {
    const prisma = prismaMock();
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-pet',
      tenantId: 'tenant-standard',
      tenant: {
        id: 'tenant-standard',
        systemType: SystemType.padrao,
        mode: SystemMode.padrao,
      },
    });
    const service = new PetClientsService(prisma as any);

    await expect(
      service.create(user({ tenantId: 'tenant-standard', systemType: 'padrao' }), {
        name: 'Maria',
        phone: '999',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia escrita em modo visualizacao', async () => {
    const prisma = prismaMock();
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-pet',
      tenantId: 'tenant-pet',
      tenant: {
        id: 'tenant-pet',
        systemType: SystemType.petshop,
        mode: SystemMode.visualizacao,
      },
    });
    const service = new PetClientsService(prisma as any);

    await expect(
      service.create(user(), { name: 'Maria', phone: '999' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite Dev SuperAdmin com filial Pet Shop selecionada', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'admin@pet.com';
    const prisma = prismaMock();
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-pet',
      tenantId: 'tenant-pet',
      tenant: {
        id: 'tenant-pet',
        systemType: SystemType.petshop,
        mode: SystemMode.petshop,
      },
    });
    const service = new PetClientsService(prisma as any);

    await service.create(
      user({
        role: Role.superAdmin,
        roles: [Role.superAdmin],
        isSuperAdmin: true,
        tenantId: null,
        branchId: null,
      }),
      { name: 'Maria', phone: '999' },
      'branch-pet',
    );

    expect(prisma.petClient.create).toHaveBeenCalled();
  });

  it('bloqueia Dev SuperAdmin quando a filial selecionada pertence ao modo padrao', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'admin@pet.com';
    const prisma = prismaMock();
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-standard',
      tenantId: 'tenant-standard',
      tenant: {
        id: 'tenant-standard',
        systemType: SystemType.padrao,
        mode: SystemMode.padrao,
      },
    });
    const service = new PetClientsService(prisma as any);

    await expect(
      service.findAll(
        user({
          role: Role.superAdmin,
          roles: [Role.superAdmin],
          isSuperAdmin: true,
          tenantId: null,
          branchId: null,
        }),
        { page: 1, pageSize: 20 },
        'branch-standard',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('retorna erro claro quando a estrutura Pet Shop nao foi migrada', async () => {
    const prisma = prismaMock();
    prisma.petClient.count.mockRejectedValueOnce({
      code: 'P2021',
      message: 'The table public.pet_clients does not exist in the current database.',
      meta: { table: 'public.pet_clients' },
    });
    const service = new PetClientsService(prisma as any);

    await expect(service.findAll(user(), { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.findAll(user(), { page: 1, pageSize: 20 })).resolves.toBeDefined();
  });

  it('lista historico de cliente com o mesmo contrato da agenda principal', async () => {
    const prisma = prismaMock();
    const service = new PetClientsService(prisma as any);

    const result = await service.listAppointments(user(), 'client-1', 'branch-pet');

    expect(result).toMatchObject({
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
      items: [
        expect.objectContaining({
          id: 'agenda-1',
          clientId: 'client-1',
          status: AgendaPetStatus.canceled,
          cancellationReason: 'Cliente remarcou',
        }),
      ],
    });
    expect((result as any).appointments).toBeUndefined();
    expect(prisma.agendaPet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-pet',
          branchId: 'branch-pet',
          clientId: 'client-1',
          deletedAt: null,
        },
      }),
    );
  });
});
