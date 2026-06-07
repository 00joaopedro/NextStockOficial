import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgendaPetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PetClientsService } from '../pet-clients/pet-clients.service';
import {
  agendaPetListInclude,
  agendaPetListOrderBy,
  formatAgendaPet,
  formatAgendaPetList,
} from './agenda-pet.formatter';
import { AgendaPetQueryDto } from './dto/agenda-pet-query.dto';
import { CreateAgendaPetDto } from './dto/create-agenda-pet.dto';
import { UpdateAgendaPetDto } from './dto/update-agenda-pet.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_DURATION_MINUTES = 60;
const CONFLICT_IGNORED_STATUSES = [
  AgendaPetStatus.canceled,
  AgendaPetStatus.completed,
  AgendaPetStatus.no_show,
];

const STATUS_TRANSITIONS: Record<AgendaPetStatus, AgendaPetStatus[]> = {
  [AgendaPetStatus.scheduled]: [
    AgendaPetStatus.confirmed,
    AgendaPetStatus.in_progress,
    AgendaPetStatus.completed,
    AgendaPetStatus.canceled,
    AgendaPetStatus.no_show,
  ],
  [AgendaPetStatus.confirmed]: [
    AgendaPetStatus.in_progress,
    AgendaPetStatus.completed,
    AgendaPetStatus.canceled,
    AgendaPetStatus.no_show,
  ],
  [AgendaPetStatus.in_progress]: [
    AgendaPetStatus.completed,
    AgendaPetStatus.canceled,
    AgendaPetStatus.no_show,
  ],
  [AgendaPetStatus.completed]: [],
  [AgendaPetStatus.canceled]: [],
  [AgendaPetStatus.no_show]: [],
};

type PetShopContext = {
  tenantId: string;
  branchId: string | null;
  mode: string;
};

type LinkedEntities = {
  client: {
    id: string;
    name: string;
    tenantId: string;
    branchId: string | null;
  };
  pet: {
    id: string;
    name: string;
    tenantId: string;
    branchId: string | null;
    clientId: string;
  };
};

@Injectable()
export class AgendaPetService {
  constructor(
    private prisma: PrismaService,
    private readonly petClientsService: PetClientsService,
  ) {}

  async findAll(
    user: Express.AuthenticatedUser | undefined,
    query: AgendaPetQueryDto,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      false,
    );
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizePageSize(query.pageSize);
    const where = this.buildWhere(context, query);

    const [total, rows] = await Promise.all([
      this.prisma.agendaPet.count({ where }),
      this.prisma.agendaPet.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: agendaPetListOrderBy,
        include: agendaPetListInclude,
      }),
    ]);

    return formatAgendaPetList(rows, { page, pageSize, total });
  }

  async findOne(
    id: string,
    user?: Express.AuthenticatedUser,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      false,
    );
    const agenda = await this.findScopedAgenda(id, context, true);

    return formatAgendaPet(agenda);
  }

  async create(
    dto: CreateAgendaPetDto,
    user?: Express.AuthenticatedUser,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      true,
    );
    const linked = await this.assertLinkedEntities(
      context.tenantId,
      context.branchId,
      dto.clientId,
      dto.petId,
    );
    const schedule = this.resolveSchedule(dto);
    await this.assertNoTimeConflict({
      tenantId: context.tenantId,
      branchId: context.branchId,
      petId: linked.pet.id,
      startAt: schedule.startAt,
      endAt: schedule.endAt,
    });

    const status = dto.status ?? AgendaPetStatus.scheduled;
    const agenda = await this.prisma.agendaPet.create({
      data: {
        cliente: linked.client.name,
        animal: linked.pet.name,
        atendente: required(dto.atendente, 'Atendente'),
        servico: required(dto.servico, 'Servico'),
        data: schedule.legacyDate,
        hora: schedule.legacyTime,
        preco: dto.preco,
        descricao: clean(dto.descricao),
        notes: clean(dto.notes),
        status,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        tenantId: context.tenantId,
        branchId: context.branchId,
        clientId: linked.client.id,
        petId: linked.pet.id,
        createdById: user?.id,
        updatedById: user?.id,
        ...(status === AgendaPetStatus.canceled
          ? {
              canceledAt: new Date(),
              canceledById: user?.id,
            }
          : {}),
      },
      include: {
        client: { select: { id: true, name: true } },
        pet: { select: { id: true, name: true, clientId: true } },
      },
    });

    return formatAgendaPet(agenda);
  }

  async update(
    id: string,
    dto: UpdateAgendaPetDto,
    user?: Express.AuthenticatedUser,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      true,
    );
    const existing = await this.findScopedAgenda(id, context, false);
    const finalClientId = dto.clientId ?? existing.clientId;
    const finalPetId = dto.petId ?? existing.petId;
    const linked = await this.assertLinkedEntities(
      context.tenantId,
      context.branchId,
      finalClientId,
      finalPetId,
    );
    const schedule = this.resolveSchedule(dto, existing);

    await this.assertNoTimeConflict({
      tenantId: context.tenantId,
      branchId: context.branchId,
      petId: linked.pet.id,
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      ignoreId: id,
    });

    const data: Prisma.AgendaPetUncheckedUpdateInput = {
      cliente: linked.client.name,
      animal: linked.pet.name,
      clientId: linked.client.id,
      petId: linked.pet.id,
      data: schedule.legacyDate,
      hora: schedule.legacyTime,
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      updatedById: user?.id,
    };

    if (dto.atendente !== undefined) data.atendente = required(dto.atendente, 'Atendente');
    if (dto.servico !== undefined) data.servico = required(dto.servico, 'Servico');
    if (dto.preco !== undefined) data.preco = dto.preco;
    if (dto.descricao !== undefined) data.descricao = clean(dto.descricao);
    if (dto.notes !== undefined) data.notes = clean(dto.notes);

    if (dto.status !== undefined) {
      this.assertStatusTransition(existing.status, dto.status);
      data.status = dto.status;

      if (dto.status === AgendaPetStatus.canceled) {
        data.canceledAt = new Date();
        data.canceledById = user?.id;
        data.cancellationReason = clean(dto.cancellationReason);
      }
    }

    const agenda = await this.prisma.agendaPet.update({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
      data,
      include: {
        client: { select: { id: true, name: true } },
        pet: { select: { id: true, name: true, clientId: true } },
      },
    });

    return formatAgendaPet(agenda);
  }

  async remove(
    id: string,
    user?: Express.AuthenticatedUser,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      true,
    );
    await this.findScopedAgenda(id, context, false);

    await this.prisma.agendaPet.update({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
      data: {
        deletedAt: new Date(),
        updatedById: user?.id,
      },
    });

    return { ok: true };
  }

  private buildWhere(
    context: PetShopContext,
    query: AgendaPetQueryDto,
  ): Prisma.AgendaPetWhereInput {
    const where: Prisma.AgendaPetWhereInput = {
      tenantId: context.tenantId,
      branchId: context.branchId,
      deletedAt: null,
    };

    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;
    if (query.petId) where.petId = query.petId;

    const dateRange = this.buildDateRange(query.startAtFrom, query.startAtTo);
    if (dateRange) {
      where.OR = [
        { startAt: dateRange },
        { startAt: null, data: dateRange },
      ];
    }

    const search = query.search?.trim();
    if (search) {
      const searchWhere: Prisma.AgendaPetWhereInput = {
        OR: [
          { cliente: { contains: search, mode: 'insensitive' } },
          { animal: { contains: search, mode: 'insensitive' } },
          { atendente: { contains: search, mode: 'insensitive' } },
          { servico: { contains: search, mode: 'insensitive' } },
          { descricao: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      };

      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), searchWhere];
    }

    return where;
  }

  private buildDateRange(startAtFrom?: string, startAtTo?: string) {
    if (!startAtFrom && !startAtTo) return null;

    const range: Prisma.DateTimeFilter = {};
    if (startAtFrom) range.gte = this.parseDate(startAtFrom, 'startAtFrom');
    if (startAtTo) range.lte = this.parseDate(startAtTo, 'startAtTo');
    return range;
  }

  private async findScopedAgenda(
    id: string,
    context: PetShopContext,
    includeRelations: boolean,
  ) {
    const agenda = await this.prisma.agendaPet.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
        deletedAt: null,
      },
      include: includeRelations
        ? {
            client: { select: { id: true, name: true } },
            pet: { select: { id: true, name: true, clientId: true } },
          }
        : undefined,
    });

    if (!agenda) {
      throw new NotFoundException('Agendamento Pet nao encontrado.');
    }

    return agenda;
  }

  private async assertLinkedEntities(
    tenantId: string,
    branchId: string | null,
    clientId?: string | null,
    petId?: string | null,
  ): Promise<LinkedEntities> {
    if (!clientId) {
      throw new BadRequestException('Cliente Pet e obrigatorio.');
    }

    if (!petId) {
      throw new BadRequestException('Animal e obrigatorio.');
    }

    const client = await this.prisma.petClient.findFirst({
      where: { id: clientId, tenantId, branchId, deletedAt: null },
      select: { id: true, name: true, tenantId: true, branchId: true },
    });

    if (!client) {
      throw new BadRequestException('Cliente Pet vinculado nao encontrado.');
    }

    const pet = await this.prisma.pet.findFirst({
      where: {
        id: petId,
        tenantId,
        branchId,
        clientId: client.id,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        branchId: true,
        clientId: true,
      },
    });

    if (!pet) {
      throw new BadRequestException('Animal vinculado nao encontrado.');
    }

    return { client, pet };
  }

  private resolveSchedule(
    dto: Pick<CreateAgendaPetDto | UpdateAgendaPetDto, 'data' | 'hora' | 'startAt' | 'endAt'>,
    fallback?: { data: Date; hora: string; startAt: Date | null; endAt: Date | null },
  ) {
    const startAt = dto.startAt
      ? this.parseDate(dto.startAt, 'startAt')
      : dto.data && dto.hora
        ? this.parseDate(`${dto.data}T${dto.hora}:00`, 'data/hora')
        : fallback?.startAt ?? fallback?.data;

    if (!startAt) {
      throw new BadRequestException('Data e hora do agendamento sao obrigatorias.');
    }

    const endAt = dto.endAt
      ? this.parseDate(dto.endAt, 'endAt')
      : fallback?.endAt && !dto.startAt && !dto.data && !dto.hora
        ? fallback.endAt
        : new Date(startAt.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);

    if (endAt <= startAt) {
      throw new BadRequestException('Horario final deve ser maior que o horario inicial.');
    }

    const legacyDate = dto.data ? this.parseDate(dto.data, 'data') : startAt;
    const legacyTime = dto.hora ?? this.formatTime(startAt);

    return { startAt, endAt, legacyDate, legacyTime };
  }

  private async assertNoTimeConflict(input: {
    tenantId: string;
    branchId: string | null;
    petId: string;
    startAt: Date;
    endAt: Date;
    ignoreId?: string;
  }) {
    const conflict = await this.prisma.agendaPet.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        petId: input.petId,
        deletedAt: null,
        status: { notIn: CONFLICT_IGNORED_STATUSES },
        ...(input.ignoreId ? { NOT: { id: input.ignoreId } } : {}),
        startAt: { lt: input.endAt },
        endAt: { gt: input.startAt },
      },
      select: { id: true },
    });

    if (conflict) {
      throw new BadRequestException(
        'Ja existe agendamento ativo para este animal no horario informado.',
      );
    }
  }

  private assertStatusTransition(
    currentStatus: AgendaPetStatus,
    nextStatus: AgendaPetStatus,
  ) {
    if (currentStatus === nextStatus) return;

    if (!STATUS_TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new BadRequestException('Transicao de status invalida.');
    }
  }

  private normalizePage(value?: number) {
    return value && value > 0 ? value : DEFAULT_PAGE;
  }

  private normalizePageSize(value?: number) {
    if (!value || value <= 0) return DEFAULT_PAGE_SIZE;
    return Math.min(value, MAX_PAGE_SIZE);
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} invalido.`);
    }
    return date;
  }

  private formatTime(value: Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(
      value.getMinutes(),
    ).padStart(2, '0')}`;
  }

}

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function required(value: string | undefined, field: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new BadRequestException(`${field} e obrigatorio.`);
  }
  return trimmed;
}
