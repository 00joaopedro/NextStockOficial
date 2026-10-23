import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AgendaPetStatus } from '@prisma/client';
import { AgendaPetService } from './agenda-pet.service';

const context = {
  tenantId: 'tenant-pet',
  branchId: 'branch-a',
  mode: 'petshop',
};

const user = {
  id: 'user-admin',
  email: 'admin@pet.test',
  role: 'Admin',
} as any;

const client = {
  id: 'client-a',
  name: 'Maria Pet',
  tenantId: context.tenantId,
  branchId: context.branchId,
};

const pet = {
  id: 'pet-a',
  name: 'Thor',
  tenantId: context.tenantId,
  branchId: context.branchId,
  clientId: client.id,
};

const agenda = {
  id: 'agenda-a',
  cliente: client.name,
  animal: pet.name,
  atendente: 'Ana',
  servico: 'Banho',
  data: new Date('2026-06-10T13:00:00.000Z'),
  hora: '10:00',
  preco: 80,
  descricao: 'Banho completo',
  status: AgendaPetStatus.scheduled,
  startAt: new Date('2026-06-10T13:00:00.000Z'),
  endAt: new Date('2026-06-10T14:00:00.000Z'),
  notes: 'Banho completo',
  clientId: client.id,
  petId: pet.id,
  canceledAt: null,
  cancellationReason: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  client: { id: client.id, name: client.name },
  pet: { id: pet.id, name: pet.name, clientId: client.id },
};

function makeService() {
  const prisma = {
    agendaPet: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([agenda]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(agenda),
      update: jest.fn().mockResolvedValue(agenda),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue(agenda),
    },
    petClient: {
      findFirst: jest.fn().mockResolvedValue(client),
    },
    pet: {
      findFirst: jest.fn().mockResolvedValue(pet),
    },
  };
  const petClientsService = {
    resolvePetShopContext: jest.fn().mockResolvedValue(context),
  };
  (prisma as any).$transaction = jest.fn().mockImplementation(async (operation) =>
    operation({ ...prisma, $executeRaw: jest.fn().mockResolvedValue(undefined) }),
  );

  return {
    service: new AgendaPetService(prisma as any, petClientsService as any),
    prisma,
    petClientsService,
  };
}

describe('AgendaPetService', () => {
  it('lista agenda sempre filtrando por tenant e branch resolvidos', async () => {
    const { service, prisma } = makeService();

    const result = await service.findAll(
      user,
      { page: 1, pageSize: 20, status: AgendaPetStatus.scheduled },
      context.branchId,
    );

    expect(result.items).toHaveLength(1);
    expect(prisma.agendaPet.count).toHaveBeenCalledWith({
      where: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        deletedAt: null,
        status: AgendaPetStatus.scheduled,
      },
    });
  });

  it('cria agenda na propria branch com cliente e pet reais', async () => {
    const { service, prisma } = makeService();

    await service.create(
      {
        cliente: 'texto ignorado',
        animal: 'texto ignorado',
        atendente: 'Ana',
        servico: 'Banho',
        data: '2026-06-10',
        hora: '10:00',
        preco: 80,
        descricao: 'Banho completo',
        clientId: client.id,
        petId: pet.id,
      },
      user,
      context.branchId,
    );

    expect(prisma.agendaPet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: context.tenantId,
          branchId: context.branchId,
          clientId: client.id,
          petId: pet.id,
          cliente: client.name,
          animal: pet.name,
          status: AgendaPetStatus.scheduled,
          createdById: user.id,
        }),
      }),
    );
  });

  it('bloqueia clientId de outro tenant ou branch', async () => {
    const { service, prisma } = makeService();
    prisma.petClient.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.create(
        {
          cliente: 'Maria',
          animal: 'Thor',
          atendente: 'Ana',
          servico: 'Banho',
          data: '2026-06-10',
          hora: '10:00',
          preco: 80,
          clientId: 'client-other',
          petId: pet.id,
        },
        user,
        context.branchId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia pet que nao pertence ao clientId informado', async () => {
    const { service, prisma } = makeService();
    prisma.pet.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.create(
        {
          cliente: 'Maria',
          animal: 'Thor',
          atendente: 'Ana',
          servico: 'Banho',
          data: '2026-06-10',
          hora: '10:00',
          preco: 80,
          clientId: client.id,
          petId: 'pet-other',
        },
        user,
        context.branchId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia conflito de horario ativo para o mesmo pet', async () => {
    const { service, prisma } = makeService();
    prisma.agendaPet.findFirst.mockResolvedValueOnce({ id: 'agenda-conflict' });

    await expect(
      service.create(
        {
          cliente: 'Maria',
          animal: 'Thor',
          atendente: 'Ana',
          servico: 'Banho',
          data: '2026-06-10',
          hora: '10:00',
          preco: 80,
          clientId: client.id,
          petId: pet.id,
        },
        user,
        context.branchId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia conflito de horario ativo para o mesmo atendente', async () => {
    const { service, prisma } = makeService();
    prisma.agendaPet.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'agenda-attendant-conflict' });

    await expect(
      service.create(
        {
          cliente: 'Maria', animal: 'Thor', atendente: 'Ana', servico: 'Banho',
          data: '2026-06-10', hora: '10:00', preco: 80,
          clientId: client.id, petId: pet.id,
        }, user, context.branchId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia edicao com versao desatualizada', async () => {
    const { service, prisma } = makeService();
    prisma.agendaPet.findFirst.mockResolvedValue(agenda);

    await expect(
      service.update(
        agenda.id,
        { expectedVersion: 2, servico: 'Tosa' },
        user,
        context.branchId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('atualiza somente a versao que a tela leu', async () => {
    const { service, prisma } = makeService();
    prisma.agendaPet.findFirst
      .mockResolvedValueOnce(agenda)
      .mockResolvedValueOnce(agenda)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await service.update(
      agenda.id,
      { expectedVersion: 1, servico: 'Tosa' },
      user,
      context.branchId,
    );

    expect(prisma.agendaPet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 1 }),
        data: expect.objectContaining({
          servico: 'Tosa',
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('apaga com soft delete dentro do escopo tenant/branch', async () => {
    const { service, prisma } = makeService();
    prisma.agendaPet.findFirst.mockResolvedValueOnce(agenda);

    await service.remove(agenda.id, user, context.branchId);

    expect(prisma.agendaPet.update).toHaveBeenCalledWith({
      where: {
        id: agenda.id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        updatedById: user.id,
      }),
    });
  });

  it('propaga bloqueio do contexto Pet Shop para usuario padrao', async () => {
    const { service, petClientsService } = makeService();
    petClientsService.resolvePetShopContext.mockRejectedValueOnce(
      new ForbiddenException('Pagina exclusiva do modo Pet Shop.'),
    );

    await expect(
      service.findAll(user, { page: 1, pageSize: 20 }, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
