import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PetsService } from './pets.service';

const context = { tenantId: 'tenant-pet', branchId: 'branch-pet', mode: 'petshop' };

function user(): Express.AuthenticatedUser {
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
  };
}

function prismaMock() {
  return {
    petClient: {
      findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }),
    },
    pet: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'pet-1',
        tenantId: 'tenant-pet',
        clientId: 'client-1',
        name: 'Thor',
        species: 'dog',
        photos: [],
      }),
      create: jest.fn().mockResolvedValue({
        id: 'pet-1',
        tenantId: 'tenant-pet',
        clientId: 'client-1',
        name: 'Thor',
        species: 'dog',
        photos: [],
      }),
      update: jest.fn().mockResolvedValue({
        id: 'pet-1',
        tenantId: 'tenant-pet',
        clientId: 'client-1',
        name: 'Thor 2',
        species: 'dog',
        photos: [],
      }),
    },
    petPhoto: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({
        id: 'photo-1',
        fileName: 'thor.jpg',
        fileUrl: 'https://example.com/thor.jpg',
        storagePath: 'tenant-pet/pet-1/photo.jpg',
      }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'photo-1',
        petId: 'pet-1',
        tenantId: 'tenant-pet',
        storagePath: 'tenant-pet/pet-1/photo.jpg',
      }),
      delete: jest.fn().mockResolvedValue({ id: 'photo-1' }),
    },
    agendaPet: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('PetsService', () => {
  it('cria pet vinculado ao cliente no tenant correto', async () => {
    const prisma = prismaMock();
    const petClientsService = {
      resolvePetShopContext: jest.fn().mockResolvedValue(context),
    };
    const service = new PetsService(prisma as any, petClientsService as any, {} as any);

    const result = await service.create(user(), 'client-1', {
      name: 'Thor',
      breed: 'SRD',
    });

    expect(result.pet).toMatchObject({ id: 'pet-1', clientId: 'client-1' });
    expect(prisma.pet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-pet',
          clientId: 'client-1',
          name: 'Thor',
        }),
      }),
    );
  });

  it('impede pet em cliente de outro tenant', async () => {
    const prisma = prismaMock();
    prisma.petClient.findFirst.mockResolvedValueOnce(null);
    const service = new PetsService(
      prisma as any,
      { resolvePetShopContext: jest.fn().mockResolvedValue(context) } as any,
      {} as any,
    );

    await expect(
      service.create(user(), 'client-other', { name: 'Thor' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atualiza e deleta pet', async () => {
    const prisma = prismaMock();
    const service = new PetsService(
      prisma as any,
      { resolvePetShopContext: jest.fn().mockResolvedValue(context) } as any,
      {} as any,
    );

    await service.update(user(), 'pet-1', { name: 'Thor 2' });
    await service.remove(user(), 'pet-1');

    expect(prisma.pet.update).toHaveBeenCalledTimes(2);
  });

  it('falha upload com tipo invalido', async () => {
    const service = new PetsService(
      prismaMock() as any,
      { resolvePetShopContext: jest.fn().mockResolvedValue(context) } as any,
      {
        uploadPetPhoto: jest
          .fn()
          .mockRejectedValue(new BadRequestException('Formato invalido.')),
      } as any,
    );

    await expect(
      service.addPhoto(user(), 'pet-1', {
        originalname: 'bad.txt',
        mimetype: 'text/plain',
        size: 10,
        buffer: Buffer.from('bad'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upload valido cria PetPhoto', async () => {
    const prisma = prismaMock();
    const service = new PetsService(
      prisma as any,
      { resolvePetShopContext: jest.fn().mockResolvedValue(context) } as any,
      {
        uploadPetPhoto: jest.fn().mockResolvedValue({
          fileName: 'thor.jpg',
          fileUrl: 'https://example.com/thor.jpg',
          storagePath: 'tenant-pet/pet-1/photo.jpg',
        }),
        removePetPhoto: jest.fn(),
      } as any,
    );

    const result = await service.addPhoto(user(), 'pet-1', {
      originalname: 'thor.jpg',
      mimetype: 'image/jpeg',
      size: 10,
      buffer: Buffer.from('ok'),
    });

    expect(result.photo).toMatchObject({ id: 'photo-1' });
    expect(prisma.petPhoto.create).toHaveBeenCalled();
  });
});
