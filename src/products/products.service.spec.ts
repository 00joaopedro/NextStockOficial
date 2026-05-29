import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma, SystemMode } from '@prisma/client';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const product = {
    id: 'product-id',
    tenantId: 'tenant-id',
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
    images: [],
  };

  const dto = {
    nome: 'Produto teste',
    precoCusto: 10,
    percentualLucro: 30,
    precoVenda: 13,
    quantidade: 5,
    branchId: 'branch-id',
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
        findFirst: jest.fn().mockResolvedValue({ id: 'branch-id' }),
      },
      product: {
        create: jest.fn().mockResolvedValue(product),
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
        data: expect.objectContaining({ tenantId: 'tenant-id' }),
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

  it('permite superAdmin criar no tenant/filial selecionado', async () => {
    const { service, prisma } = makeService(SystemMode.padrao);
    const superAdmin = {
      ...user,
      role: 'superAdmin',
      roles: ['superAdmin'],
      isSuperAdmin: true,
      is_super_admin: true,
    };

    await expect(
      service.create(superAdmin, {
        ...dto,
        tenantId: 'tenant-id',
        branchId: 'branch-id',
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(prisma.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'branch-id',
          tenantId: 'tenant-id',
          isActive: true,
        }),
      }),
    );
  });
});
