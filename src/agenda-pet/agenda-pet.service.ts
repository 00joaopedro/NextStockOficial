import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PetClientsService } from '../pet-clients/pet-clients.service';
import { CreateAgendaPetDto } from './dto/create-agenda-pet.dto';
import { UpdateAgendaPetDto } from './dto/update-agenda-pet.dto';

type DateFilterType = 'day' | 'week' | 'month' | 'year';

function getRange(dateValue: string, type: DateFilterType) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid dateValue');

  const start = new Date(d);
  const end = new Date(d);

  switch (type) {
    case 'day':
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCHours(23, 59, 59, 999);
      break;
    case 'week': {
      // ISO week start Monday
      const day = start.getUTCDay() || 7; // Sunday=0 -> 7
      start.setUTCDate(start.getUTCDate() - (day - 1));
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCDate(start.getUTCDate() + 6);
      end.setUTCHours(23, 59, 59, 999);
      break;
    }
    case 'month':
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCMonth(start.getUTCMonth() + 1, 0); // last day of month
      end.setUTCHours(23, 59, 59, 999);
      break;
    case 'year':
      start.setUTCMonth(0, 1);
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCFullYear(start.getUTCFullYear() + 1, 0, 0);
      end.setUTCHours(0, 0, 0, 0);
      end.setUTCDate(end.getUTCDate() - 1);
      end.setUTCHours(23, 59, 59, 999);
      break;
    default:
      throw new BadRequestException('Invalid dateFilterType');
  }

  return { gte: start.toISOString(), lte: end.toISOString() };
}

@Injectable()
export class AgendaPetService {
  constructor(
    private prisma: PrismaService,
    private readonly petClientsService: PetClientsService,
  ) {}

  async findAll(options: {
    page?: number;
    limit?: number;
    atendente?: string;
    dateFilterType?: DateFilterType;
    dateValue?: string;
    selectedBranchId?: string;
    user?: Express.AuthenticatedUser;
  }) {
    const context = await this.petClientsService.resolvePetShopContext(
      options.user,
      options.selectedBranchId,
      false,
    );
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 12;
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId: context.tenantId,
      branchId: context.branchId,
    };
    if (options.atendente) where.atendente = { contains: options.atendente, mode: 'insensitive' };
    if (options.dateFilterType && options.dateValue) {
      where.data = getRange(options.dateValue, options.dateFilterType);
    }

    const [total, data] = await Promise.all([
      this.prisma.agendaPet.count({ where }),
      this.prisma.agendaPet.findMany({ where, skip, take: limit, orderBy: { data: 'asc' } }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
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
    const agenda = await this.prisma.agendaPet.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
    });

    if (!agenda) {
      throw new NotFoundException('Agenda pet not found.');
    }

    return agenda;
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
    await this.assertLinkedEntities(
      context.tenantId,
      context.branchId,
      dto.clientId,
      dto.petId,
    );
    const payload = {
      ...dto,
      data: new Date(dto.data),
      preco: dto.preco,
      tenantId: context.tenantId,
      branchId: context.branchId,
    } as any;
    return this.prisma.agendaPet.create({ data: payload });
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
    await this.assertTenantOwnership(id, context.tenantId, context.branchId);
    await this.assertLinkedEntities(
      context.tenantId,
      context.branchId,
      dto.clientId,
      dto.petId,
    );

    const data: any = { ...dto };
    delete data.tenantId;
    delete data.branchId;
    if (dto.data) data.data = new Date(dto.data);
    return this.prisma.agendaPet.update({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
      data,
    });
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
    await this.assertTenantOwnership(id, context.tenantId, context.branchId);

    return this.prisma.agendaPet.delete({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
    });
  }

  private async assertTenantOwnership(
    id: string,
    tenantId: string,
    branchId: string | null,
  ) {
    const agenda = await this.prisma.agendaPet.findFirst({
      where: { id, tenantId, branchId },
      select: { id: true },
    });

    if (!agenda) {
      throw new NotFoundException('Agenda pet not found.');
    }

  }

  private async assertLinkedEntities(
    tenantId: string,
    branchId: string | null,
    clientId?: string | null,
    petId?: string | null,
  ) {
    if (clientId) {
      const client = await this.prisma.petClient.findFirst({
        where: { id: clientId, tenantId, branchId, deletedAt: null },
        select: { id: true },
      });

      if (!client) {
        throw new BadRequestException('Cliente Pet vinculado nao encontrado.');
      }
    }

    if (petId) {
      const pet = await this.prisma.pet.findFirst({
        where: {
          id: petId,
          tenantId,
          branchId,
          deletedAt: null,
          ...(clientId ? { clientId } : {}),
        },
        select: { id: true },
      });

      if (!pet) {
        throw new BadRequestException('Animal vinculado nao encontrado.');
      }
    }
  }
}
