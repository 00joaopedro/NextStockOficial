import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, SystemMode, SystemType } from '@prisma/client';
import { isSuperAdmin } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import { CreatePetClientDto } from './dto/create-pet-client.dto';
import { PetClientQueryDto } from './dto/pet-client-query.dto';
import { UpdatePetClientDto } from './dto/update-pet-client.dto';

const PREVIEW_BLOCKED_MESSAGE = 'Modo visualizacao: alteracao bloqueada.';
const PETSHOP_ONLY_MESSAGE = 'Pagina exclusiva do modo Pet Shop.';
const MISSING_BRANCH_MESSAGE = 'Usuario sem filial selecionada.';

type PetShopContext = {
  tenantId: string;
  branchId: string | null;
  mode: SystemMode;
};

@Injectable()
export class PetClientsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly usageService?: UsageService,
  ) {}

  async findAll(
    user: Express.AuthenticatedUser | undefined,
    query: PetClientQueryDto,
    selectedBranchId?: string,
  ) {
    const context = await this.resolvePetShopContext(user, selectedBranchId, false);
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const search = query.search?.trim();
    const where: Prisma.PetClientWhereInput = {
      tenantId: context.tenantId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, clients] = await Promise.all([
      this.prisma.petClient.count({ where }),
      this.prisma.petClient.findMany({
        where,
        include: {
          pets: {
            where: { deletedAt: null },
            include: { photos: { orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    await this.recordUsage(user, 'pet_clients_list', 1, 0, { count: clients.length });

    return {
      ok: true,
      mode: context.mode,
      clients: clients.map((client) => this.formatClient(client)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 0,
      },
    };
  }

  async findOne(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
  ) {
    const context = await this.resolvePetShopContext(user, selectedBranchId, false);
    const client = await this.findTenantClient(context.tenantId, id, true);
    await this.recordUsage(user, 'pet_client_detail', 1, 0, { clientId: id });

    return {
      ok: true,
      mode: context.mode,
      client: this.formatClient(client),
    };
  }

  async create(
    user: Express.AuthenticatedUser | undefined,
    dto: CreatePetClientDto,
    selectedBranchId?: string,
  ) {
    const context = await this.resolvePetShopContext(user, selectedBranchId, true);

    const client = await this.prisma.petClient.create({
      data: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        ...this.buildCreateData(dto),
      },
      include: {
        pets: { include: { photos: true } },
      },
    });

    await this.recordUsage(user, 'pet_client_create', 0, 1, { clientId: client.id });

    return {
      ok: true,
      client: this.formatClient(client),
    };
  }

  async update(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdatePetClientDto,
    selectedBranchId?: string,
  ) {
    const context = await this.resolvePetShopContext(user, selectedBranchId, true);
    await this.findTenantClient(context.tenantId, id, false);

    const client = await this.prisma.petClient.update({
      where: { id },
      data: this.buildUpdateData(dto),
      include: {
        pets: {
          where: { deletedAt: null },
          include: { photos: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    await this.recordUsage(user, 'pet_client_update', 0, 1, { clientId: id });

    return {
      ok: true,
      client: this.formatClient(client),
    };
  }

  async remove(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
  ) {
    const context = await this.resolvePetShopContext(user, selectedBranchId, true);
    await this.findTenantClient(context.tenantId, id, false);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.pet.updateMany({
        where: { tenantId: context.tenantId, clientId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.petClient.update({
        where: { id },
        data: { deletedAt: now },
      }),
    ]);

    await this.recordUsage(user, 'pet_client_delete', 0, 1, { clientId: id });

    return { ok: true };
  }

  async listAppointments(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
  ) {
    const context = await this.resolvePetShopContext(user, selectedBranchId, false);
    await this.findTenantClient(context.tenantId, id, false);

    const appointments = await this.prisma.agendaPet.findMany({
      where: {
        tenantId: context.tenantId,
        clientId: id,
      },
      orderBy: { data: 'desc' },
    });

    return { ok: true, appointments };
  }

  async resolvePetShopContext(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId?: string,
    writable = false,
  ): Promise<PetShopContext> {
    if (!user) {
      throw new UnauthorizedException('Sessao expirada. Faca login novamente.');
    }

    if (isSuperAdmin(user) && selectedBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: selectedBranchId, isActive: true },
        select: {
          id: true,
          tenant: {
            select: { id: true, systemType: true, mode: true },
          },
        },
      });

      if (!branch) {
        throw new ForbiddenException('Filial selecionada nao encontrada.');
      }

      this.assertPetShopTenant(branch.tenant.systemType);
      this.assertWritableMode(branch.tenant.mode, writable);

      return {
        tenantId: branch.tenant.id,
        branchId: branch.id,
        mode: branch.tenant.mode,
      };
    }

    const tenantId = user.tenantId ?? user.primaryTenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Usuario sem tenant/empresa vinculado.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, systemType: true, mode: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant/empresa nao encontrado.');
    }

    this.assertPetShopTenant(tenant.systemType);
    this.assertWritableMode(tenant.mode, writable);

    const branchId = user.branchId ?? selectedBranchId ?? null;

    if (writable && !branchId) {
      throw new BadRequestException(MISSING_BRANCH_MESSAGE);
    }

    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: tenant.id, isActive: true },
        select: { id: true },
      });

      if (!branch) {
        throw new ForbiddenException('Filial nao encontrada para este tenant.');
      }
    }

    return {
      tenantId: tenant.id,
      branchId,
      mode: tenant.mode,
    };
  }

  private assertPetShopTenant(systemType: SystemType) {
    if (systemType !== SystemType.petshop) {
      throw new ForbiddenException(PETSHOP_ONLY_MESSAGE);
    }
  }

  private assertWritableMode(mode: SystemMode, writable: boolean) {
    if (writable && mode === SystemMode.visualizacao) {
      throw new ForbiddenException(PREVIEW_BLOCKED_MESSAGE);
    }
  }

  private async findTenantClient(
    tenantId: string,
    id: string,
    includePets: boolean,
  ) {
    const client = await this.prisma.petClient.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: includePets
        ? {
            pets: {
              where: { deletedAt: null },
              include: { photos: { orderBy: { createdAt: 'asc' } } },
              orderBy: { createdAt: 'desc' },
            },
          }
        : undefined,
    });

    if (!client) {
      throw new NotFoundException('Cliente Pet nao encontrado.');
    }

    return client;
  }

  private buildCreateData(dto: CreatePetClientDto) {
    const name = dto.name?.trim();
    const phone = dto.phone?.trim();

    if (!name || !phone) {
      throw new BadRequestException('Nome e telefone sao obrigatorios.');
    }

    return {
      name,
      phone,
      email: clean(dto.email),
      document: clean(dto.document),
      address: dto.address ? (dto.address as Prisma.InputJsonValue) : undefined,
      notes: clean(dto.notes),
    };
  }

  private buildUpdateData(dto: UpdatePetClientDto): Prisma.PetClientUncheckedUpdateInput {
    const data: Prisma.PetClientUncheckedUpdateInput = {};

    if (dto.name !== undefined) data.name = required(dto.name, 'Nome');
    if (dto.phone !== undefined) data.phone = required(dto.phone, 'Telefone');
    if (dto.email !== undefined) data.email = clean(dto.email);
    if (dto.document !== undefined) data.document = clean(dto.document);
    if (dto.address !== undefined) {
      data.address = dto.address ? (dto.address as Prisma.InputJsonValue) : Prisma.JsonNull;
    }
    if (dto.notes !== undefined) data.notes = clean(dto.notes);

    return data;
  }

  private formatClient(client: any) {
    return {
      id: client.id,
      tenantId: client.tenantId,
      branchId: client.branchId,
      name: client.name,
      phone: client.phone,
      email: client.email,
      document: client.document,
      address: client.address ?? {},
      notes: client.notes,
      pets: Array.isArray(client.pets)
        ? client.pets.map((pet: any) => ({
            id: pet.id,
            tenantId: pet.tenantId,
            clientId: pet.clientId,
            name: pet.name,
            species: pet.species,
            breed: pet.breed,
            birthDate: pet.birthDate,
            ageText: pet.ageText,
            weight: pet.weight,
            height: pet.height,
            width: pet.width,
            length: pet.length,
            foodPerDay: pet.foodPerDay,
            description: pet.description,
            vaccinesTaken: pet.vaccinesTaken,
            vaccinesPending: pet.vaccinesPending,
            photos: pet.photos ?? [],
            createdAt: pet.createdAt,
            updatedAt: pet.updatedAt,
          }))
        : [],
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  private async recordUsage(
    user: Express.AuthenticatedUser | undefined,
    eventType: string,
    dbReadCount: number,
    dbWriteCount: number,
    metadata?: Record<string, unknown>,
  ) {
    await this.usageService?.record({
      user,
      eventType,
      dbReadCount,
      dbWriteCount,
      metadata,
    });
  }
}

function clean(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function required(value: string, label: string) {
  const cleaned = value?.trim();

  if (!cleaned) {
    throw new BadRequestException(`${label} e obrigatorio.`);
  }

  return cleaned;
}
