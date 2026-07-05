import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  agendaPetListInclude,
  agendaPetListOrderBy,
  formatAgendaPetList,
} from '../agenda-pet/agenda-pet.formatter';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { UsageService } from '../usage/usage.service';
import { PetClientsService } from '../pet-clients/pet-clients.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

type UploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petClientsService: PetClientsService,
    private readonly storage: SupabaseStorageService,
    @Optional() private readonly usageService?: UsageService,
  ) {}

  async listByClient(
    user: Express.AuthenticatedUser | undefined,
    clientId: string,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      false,
    );
    await this.assertClient(context.tenantId, context.branchId, clientId);

    const pets = await this.prisma.pet.findMany({
      where: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        clientId,
        deletedAt: null,
      },
      include: {
        photos: {
          where: {
            tenantId: context.tenantId,
            branchId: context.branchId,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.recordUsage(user, 'pets_list', 1, 0, { clientId, count: pets.length });

    return {
      ok: true,
      pets: pets.map((pet) => this.formatPet(pet)),
    };
  }

  async create(
    user: Express.AuthenticatedUser | undefined,
    clientId: string,
    dto: CreatePetDto,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      true,
    );
    await this.assertClient(context.tenantId, context.branchId, clientId);

    const pet = await this.prisma.pet.create({
      data: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        clientId,
        ...this.buildCreateData(dto),
      },
      include: { photos: true },
    });

    await this.recordUsage(user, 'pet_create', 0, 1, { clientId, petId: pet.id });

    return {
      ok: true,
      pet: this.formatPet(pet),
    };
  }

  async findOne(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      false,
    );
    const pet = await this.assertPet(context.tenantId, context.branchId, id, true);

    return {
      ok: true,
      pet: this.formatPet(pet),
    };
  }

  async update(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdatePetDto,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      true,
    );
    await this.assertPet(context.tenantId, context.branchId, id, false);

    const pet = await this.prisma.pet.update({
      where: { id, tenantId: context.tenantId, branchId: context.branchId },
      data: this.buildUpdateData(dto),
      include: {
        photos: {
          where: {
            tenantId: context.tenantId,
            branchId: context.branchId,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    await this.recordUsage(user, 'pet_update', 0, 1, { petId: id });

    return {
      ok: true,
      pet: this.formatPet(pet),
    };
  }

  async remove(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      true,
    );
    await this.assertPet(context.tenantId, context.branchId, id, false);

    await this.prisma.pet.update({
      where: { id, tenantId: context.tenantId, branchId: context.branchId },
      data: { deletedAt: new Date() },
    });

    await this.recordUsage(user, 'pet_delete', 0, 1, { petId: id });

    return { ok: true };
  }

  async listPhotos(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      false,
    );
    await this.assertPet(context.tenantId, context.branchId, id, false);

    const photos = await this.prisma.petPhoto.findMany({
      where: { tenantId: context.tenantId, branchId: context.branchId, petId: id },
      orderBy: { createdAt: 'asc' },
    });

    return { ok: true, photos };
  }

  async addPhoto(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    file: UploadFile,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      true,
    );
    await this.assertPet(context.tenantId, context.branchId, id, false);

    const currentCount = await this.prisma.petPhoto.count({
      where: { tenantId: context.tenantId, branchId: context.branchId, petId: id },
    });

    if (currentCount >= 3) {
      throw new BadRequestException('E permitido adicionar no maximo 3 fotos por animal.');
    }

    const uploaded = await this.storage.uploadPetPhoto({
      tenantId: context.tenantId,
      branchId: context.branchId!,
      petId: id,
      ownerProfileId: user?.id,
      file,
    });

    try {
      const photo = await this.prisma.petPhoto.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId,
          petId: id,
          ...uploaded,
        },
      });

      await this.recordUsage(user, 'pet_photo_upload', 0, 1, {
        petId: id,
        photoId: photo.id,
      });

      return { ok: true, photo };
    } catch (error) {
      await this.storage.removePetPhotoVariants(
        uploaded.storagePath,
        uploaded.mediumPath,
        uploaded.thumbnailPath,
      );
      throw error;
    }
  }

  async removePhoto(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    photoId: string,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      true,
    );
    await this.assertPet(context.tenantId, context.branchId, id, false);

    const photo = await this.prisma.petPhoto.findFirst({
      where: {
        id: photoId,
        petId: id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
    });

    if (!photo) {
      throw new NotFoundException('Foto do animal nao encontrada.');
    }

    await this.storage.removePetPhotoVariants(
      photo.storagePath,
      photo.mediumPath,
      photo.thumbnailPath,
    );
    await this.prisma.petPhoto.delete({
      where: {
        id: photo.id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
    });

    return { ok: true };
  }

  async listAppointments(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
  ) {
    const context = await this.petClientsService.resolvePetShopContext(
      user,
      selectedBranchId,
      false,
    );
    await this.assertPet(context.tenantId, context.branchId, id, false);

    const appointments = await this.prisma.agendaPet.findMany({
      where: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        petId: id,
        deletedAt: null,
      },
      include: agendaPetListInclude,
      orderBy: agendaPetListOrderBy,
      take: 100,
    });

    return formatAgendaPetList(appointments, {
      page: 1,
      pageSize: 100,
      total: appointments.length,
    });
  }

  private async assertClient(
    tenantId: string,
    branchId: string | null,
    clientId: string,
  ) {
    const client = await this.prisma.petClient.findFirst({
      where: { id: clientId, tenantId, branchId, deletedAt: null },
      select: { id: true },
    });

    if (!client) {
      throw new NotFoundException('Cliente Pet nao encontrado.');
    }
  }

  private async assertPet(
    tenantId: string,
    branchId: string | null,
    id: string,
    includePhotos: boolean,
  ) {
    const pet = await this.prisma.pet.findFirst({
      where: { id, tenantId, branchId, deletedAt: null },
      include: includePhotos
        ? {
            photos: {
              where: { tenantId, branchId },
              orderBy: { createdAt: 'asc' },
            },
          }
        : undefined,
    });

    if (!pet) {
      throw new NotFoundException('Animal nao encontrado.');
    }

    return pet;
  }

  private buildCreateData(dto: CreatePetDto) {
    const name = dto.name?.trim();

    if (!name) {
      throw new BadRequestException('Nome do animal e obrigatorio.');
    }

    return {
      name,
      species: clean(dto.species) ?? 'dog',
      breed: clean(dto.breed),
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      ageText: clean(dto.ageText),
      weight: clean(dto.weight),
      height: clean(dto.height),
      width: clean(dto.width),
      length: clean(dto.length),
      foodPerDay: clean(dto.foodPerDay),
      description: clean(dto.description),
      vaccinesTaken: clean(dto.vaccinesTaken),
      vaccinesPending: clean(dto.vaccinesPending),
    };
  }

  private buildUpdateData(dto: UpdatePetDto): Prisma.PetUncheckedUpdateInput {
    const data: Prisma.PetUncheckedUpdateInput = {};

    if (dto.name !== undefined) data.name = required(dto.name, 'Nome do animal');
    if (dto.species !== undefined) data.species = clean(dto.species) ?? 'dog';
    if (dto.breed !== undefined) data.breed = clean(dto.breed);
    if (dto.birthDate !== undefined) {
      data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    }
    if (dto.ageText !== undefined) data.ageText = clean(dto.ageText);
    if (dto.weight !== undefined) data.weight = clean(dto.weight);
    if (dto.height !== undefined) data.height = clean(dto.height);
    if (dto.width !== undefined) data.width = clean(dto.width);
    if (dto.length !== undefined) data.length = clean(dto.length);
    if (dto.foodPerDay !== undefined) data.foodPerDay = clean(dto.foodPerDay);
    if (dto.description !== undefined) data.description = clean(dto.description);
    if (dto.vaccinesTaken !== undefined) data.vaccinesTaken = clean(dto.vaccinesTaken);
    if (dto.vaccinesPending !== undefined) data.vaccinesPending = clean(dto.vaccinesPending);

    return data;
  }

  private formatPet(pet: any) {
    return {
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
