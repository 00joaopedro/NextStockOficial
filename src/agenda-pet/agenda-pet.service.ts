import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isSuperAdmin } from '../auth/super-admin.util';
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
  constructor(private prisma: PrismaService) {}

  async findAll(options: {
    page?: number;
    limit?: number;
    atendente?: string;
    dateFilterType?: DateFilterType;
    dateValue?: string;
    tenantId?: string;
    user?: Express.AuthenticatedUser;
  }) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 12;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (options.tenantId) where.tenantId = options.tenantId;
    if (isSuperAdmin(options.user) && !options.tenantId) delete where.tenantId;
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

  async findOne(id: string, user?: Express.AuthenticatedUser) {
    const agenda = await this.prisma.agendaPet.findFirst({
      where: isSuperAdmin(user)
        ? { id }
        : { id, tenantId: this.requireTenantId(user?.tenantId) },
    });

    if (!agenda) {
      throw new NotFoundException('Agenda pet not found.');
    }

    return agenda;
  }

  create(dto: CreateAgendaPetDto, user?: Express.AuthenticatedUser) {
    const payload = {
      ...dto,
      data: new Date(dto.data),
      preco: dto.preco,
      tenantId: this.resolveWritableTenantId(user, dto.tenantId),
    } as any;
    return this.prisma.agendaPet.create({ data: payload });
  }

  async update(id: string, dto: UpdateAgendaPetDto, user?: Express.AuthenticatedUser) {
    await this.assertTenantOwnership(id, user);

    const data: any = { ...dto };
    delete data.tenantId;
    if (dto.data) data.data = new Date(dto.data);
    return this.prisma.agendaPet.update({ where: { id }, data });
  }

  async remove(id: string, user?: Express.AuthenticatedUser) {
    await this.assertTenantOwnership(id, user);

    return this.prisma.agendaPet.delete({ where: { id } });
  }

  private requireTenantId(tenantId?: string | null) {
    if (!tenantId) {
      throw new UnauthorizedException(
        'Authenticated user is not linked to a tenant.',
      );
    }

    return tenantId;
  }

  private resolveWritableTenantId(user?: Express.AuthenticatedUser, requestedTenantId?: string | null) {
    if (isSuperAdmin(user)) {
      const tenantId = requestedTenantId ?? user?.tenantId ?? user?.primaryTenantId;

      if (!tenantId) {
        throw new UnauthorizedException(
          'tenantId is required for superAdmin writes.',
        );
      }

      return tenantId;
    }

    return this.requireTenantId(user?.tenantId);
  }

  private async assertTenantOwnership(id: string, user?: Express.AuthenticatedUser) {
    const agenda = await this.prisma.agendaPet.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!agenda) {
      throw new NotFoundException('Agenda pet not found.');
    }

    if (isSuperAdmin(user)) {
      return;
    }

    if (agenda.tenantId !== this.requireTenantId(user?.tenantId)) {
      throw new ForbiddenException(
        'You can only access data from your own tenant.',
      );
    }
  }
}
