import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, SystemMode } from '@prisma/client';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const product = {
    id: 'product-id',
    tenantId: 'tenant-id',
    branchId: 'branch-id',
    name: 'Produto teste',
    costPriceCents: 1000,
    profitPercent: new Prisma.Decimal(30),
    salePriceCents: 1300,
    quantity: 5,
    brand: null,
    category: null,
    supplier: null,
    sku: null,
    barcode: null,
    description: null,
    weight: null,
    height: null,
    width: null,
    externalLink: null,
    clothingSize: null,
    apparelSize: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    images: [
      {
        id: 'image-id',
        productId: 'product-id',
        fileName: 'produto.jpg',
        fileUrl: 'https://storage.test/produto.jpg',
        storagePath: 'tenant-id/branch-id/products/product-id/image.jpg',
        createdAt: new Date(),
      },
    ],
  };

  const dto = {
    nome: 'Produto teste',
    precoCusto: 10,
    percentualLucro: 30,
    precoVenda: 13,
    quantidade: 5,
  };

  const user = {
    id: 'user-id',
    email: 'user@test.com',
    role: 'Admin',
    roles: ['Admin'],
    tenantId: 'tenant-id',
    primaryTenantId: 'tenant-id',
    branchId: 'branch-id',
    systemType: 'padrao',
    mode: SystemMode.padrao,
    isSuperAdmin: false,
    is_super_admin: false,
  } as any;

  function makeService(mode: SystemMode = SystemMode.padrao) {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-id', mode }),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-id',
          tenantId: 'tenant-id',
          tenant: { id: 'tenant-id', mode, systemType: 'padrao' },
        }),
      },
      tenantMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'member-id',
          role: 'Admin',
          tenantId: 'tenant-id',
          branchId: 'branch-id',
          branch: {
            id: 'branch-id',
            tenantId: 'tenant-id',
            isActive: true,
          },
        }),
      },
      product: {
        create: jest.fn().mockResolvedValue(product),
        findMany: jest.fn().mockResolvedValue([product]),
        findFirst: jest.fn().mockResolvedValue({ id: 'product-id' }),
        delete: jest.fn().mockResolvedValue(product),
      },
      productImage: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(product.images[0]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(product.images[0]),
        delete: jest.fn().mockResolvedValue(product.images[0]),
      },
      devWorkspace: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;

    return { service: new ProductsService(prisma), prisma };
  }

  it('bloqueia criacao sem usuario/JWT', async () => {
    const { service } = makeService();

    await expect(service.create(undefined, dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('cria produto para usuario comum padrao no tenant autenticado', async () => {
    const { service, prisma } = makeService(SystemMode.padrao);

    await expect(service.create(user, dto)).resolves.toMatchObject({
      ok: true,
      product: { id: 'product-id', nome: 'Produto teste' },
    });
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-id',
          branchId: 'branch-id',
        }),
      }),
    );
  });

  it('cria produto para usuario Pet Shop no tenant autenticado', async () => {
    const { service } = makeService(SystemMode.petshop);

    await expect(
      service.create({ ...user, systemType: 'petshop', mode: SystemMode.petshop }, dto),
    ).resolves.toMatchObject({
      ok: true,
      product: { id: 'product-id' },
    });
  });

  it('bloqueia criacao em modo visualizacao', async () => {
    const { service } = makeService(SystemMode.visualizacao);

    await expect(service.create(user, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite Dev SuperAdmin criar em tenant real somente via suporte explicito', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'user@test.com';
    const { service, prisma } = makeService(SystemMode.padrao);
    const superAdmin = {
      ...user,
      role: 'superAdmin',
      roles: ['superAdmin'],
      isSuperAdmin: true,
      is_super_admin: true,
    };

    await expect(
      service.create(superAdmin, dto, 'branch-id', 'support'),
    ).resolves.toMatchObject({ ok: true });
    expect(prisma.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'branch-id',
          isActive: true,
        }),
      }),
    );
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
  });

  it('lookup do PDV busca barcode somente na filial autenticada', async () => {
    const { service, prisma } = makeService(SystemMode.padrao);

    await expect(
      service.lookupForPos(user, { barcode: '7891234567890' }, 'branch-id'),
    ).resolves.toMatchObject({
      ok: true,
      products: [
        expect.objectContaining({
          id: 'product-id',
          saleMode: 'unit',
          salePriceCents: 1300,
        }),
      ],
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-id',
          branchId: 'branch-id',
          barcode: '7891234567890',
          quantity: { gt: 0 },
        }),
      }),
    );
  });

  it('superAdmin comum nao pode selecionar tenant por body/header', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    const { service, prisma } = makeService(SystemMode.padrao);
    prisma.tenantMember.findFirst.mockResolvedValueOnce(null);
    const superAdmin = {
      ...user,
      tenantId: null,
      primaryTenantId: null,
      branchId: null,
      role: 'superAdmin',
      roles: ['superAdmin'],
      isSuperAdmin: true,
    };

    await expect(service.create(superAdmin, dto, 'branch-id')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('nao remove produto de outro tenant', async () => {
    const { service, prisma } = makeService(SystemMode.padrao);
    prisma.product.findFirst.mockResolvedValueOnce(null);

    await expect(service.remove(user, 'product-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('branch A nao remove produto da branch B', async () => {
    const { service, prisma } = makeService(SystemMode.padrao);
    prisma.product.findFirst.mockResolvedValueOnce(null);

    await expect(service.remove(user, 'product-branch-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'product-branch-b',
          tenantId: 'tenant-id',
          branchId: 'branch-id',
        }),
      }),
    );
  });

  it('faz upload real de imagem do produto no storage e salva ProductImage', async () => {
    const { prisma } = makeService(SystemMode.padrao);
    const storage = {
      uploadProductImage: jest.fn().mockResolvedValue({
        fileName: 'produto.jpg',
        fileUrl: 'https://storage.test/produto.jpg',
        storagePath: 'tenant-id/branch-id/products/product-id/image.jpg',
      }),
      removeProductImage: jest.fn(),
      getProductImageUrl: jest.fn(),
    };
    const service = new ProductsService(prisma, undefined, undefined, storage as any);

    const result = await service.uploadImage(user, 'product-id', {
      originalname: 'produto.jpg',
      mimetype: 'image/jpeg',
      size: 10,
      buffer: Buffer.from('ok'),
    });

    expect(result.image).toMatchObject({ fileUrl: 'https://storage.test/produto.jpg' });
    expect(storage.uploadProductImage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-id',
        branchId: 'branch-id',
        productId: 'product-id',
      }),
    );
    expect(prisma.productImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-id',
        fileUrl: 'https://storage.test/produto.jpg',
        storagePath: 'tenant-id/branch-id/products/product-id/image.jpg',
      }),
    });
  });

  it('rejeita metadado de imagem sem URL ou storagePath', async () => {
    const { service } = makeService(SystemMode.padrao);

    await expect(
      service.addImages(user, 'product-id', {
        images: [{ fileName: 'fantasma.jpg' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retorna imagens com URL renderizavel em GET /api/products', async () => {
    const { service } = makeService(SystemMode.padrao);

    const result = await service.findAll(user, {});

    expect((result.products[0] as any).imageMetadata[0]).toMatchObject({
      fileName: 'produto.jpg',
      fileUrl: 'https://storage.test/produto.jpg',
      storagePath: 'tenant-id/branch-id/products/product-id/image.jpg',
    });
  });
});
