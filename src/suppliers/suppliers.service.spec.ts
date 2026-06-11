import { ConflictException } from '@nestjs/common';
import { Role, SupplierPersonType, SupplierStatus, SystemMode, SystemType } from '@prisma/client';
import { SuppliersService } from './suppliers.service';

const context = {
  userId: 'admin-id',
  tenantId: 'tenant-id',
  branchId: 'branch-id',
  role: Role.Admin,
  systemType: SystemType.padrao,
  mode: SystemMode.padrao,
  isDevSuperAdmin: false,
  contextKind: 'normal',
};

const supplierRecord = {
  id: 'supplier-id',
  tenantId: context.tenantId,
  branchId: context.branchId,
  legalName: 'Distribuidora Norte',
  tradeName: 'Norte',
  personType: SupplierPersonType.company,
  document: '12345678000190',
  stateRegistration: null,
  mainContact: 'Maria',
  phone: '91999990000',
  whatsapp: null,
  email: 'contato@norte.com',
  site: null,
  zipCode: null,
  city: null,
  state: null,
  district: null,
  street: null,
  number: null,
  complement: null,
  averageDeliveryTime: null,
  productCategories: null,
  paymentTerms: null,
  status: SupplierStatus.active,
  notes: null,
  createdById: context.userId,
  updatedById: context.userId,
  deletedAt: null,
  createdAt: new Date('2026-06-10T10:00:00.000Z'),
  updatedAt: new Date('2026-06-10T10:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

function makeService(overrides: Record<string, any> = {}) {
  const prisma = {
    supplier: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([supplierRecord]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(supplierRecord),
      update: jest.fn().mockResolvedValue(supplierRecord),
    },
    $transaction: jest.fn((items) => Promise.all(items)),
    ...overrides.prisma,
  };
  const tenantContext = {
    resolve: jest.fn().mockResolvedValue(context),
    ...overrides.tenantContext,
  };

  return {
    service: new SuppliersService(prisma as any, tenantContext as any),
    prisma,
    tenantContext,
  };
}

describe('SuppliersService', () => {
  it('lista fornecedores somente do tenant e branch resolvidos', async () => {
    const { service, prisma, tenantContext } = makeService();

    const result = await service.findAll(
      { id: 'admin-id', email: 'admin@test.com' } as any,
      { page: 1, pageSize: 20 },
      'branch-id',
    );

    expect(tenantContext.resolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        selectedBranchId: 'branch-id',
        requireBranch: true,
        writable: false,
        allowedRoles: [Role.Admin, Role.Vendedor, Role.Comprador],
      }),
    );
    expect(prisma.supplier.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: context.tenantId,
        branchId: context.branchId,
        deletedAt: null,
      }),
    });
    expect(result.items).toHaveLength(1);
  });

  it('cria fornecedor usando tenant e branch do backend', async () => {
    const { service, prisma } = makeService();

    await service.create(
      { id: 'admin-id', email: 'admin@test.com' } as any,
      {
        legalName: 'Distribuidora Norte',
        tradeName: 'Norte',
        personType: SupplierPersonType.company,
        document: '12.345.678/0001-90',
        mainContact: 'Maria',
        phone: '(91) 99999-0000',
        email: 'CONTATO@NORTE.COM',
      },
      'branch-id',
    );

    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: context.tenantId,
          branchId: context.branchId,
          document: '12345678000190',
          email: 'contato@norte.com',
          createdById: context.userId,
          updatedById: context.userId,
        }),
      }),
    );
  });

  it('falha quando documento ja existe na mesma filial', async () => {
    const { service } = makeService({
      prisma: {
        supplier: {
          findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
          create: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn(),
        },
        $transaction: jest.fn((items) => Promise.all(items)),
      },
    });

    await expect(
      service.create(
        { id: 'admin-id', email: 'admin@test.com' } as any,
        {
          legalName: 'Distribuidora Norte',
          personType: SupplierPersonType.company,
          document: '12.345.678/0001-90',
          phone: '(91) 99999-0000',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft delete marca deletedAt e status inactive no escopo correto', async () => {
    const prisma = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue(supplierRecord),
        update: jest.fn().mockResolvedValue({
          ...supplierRecord,
          status: SupplierStatus.inactive,
          deletedAt: new Date('2026-06-10T12:00:00.000Z'),
        }),
      },
    };
    const { service } = makeService({ prisma });

    await service.remove({ id: 'admin-id', email: 'admin@test.com' } as any, 'supplier-id');

    expect(prisma.supplier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'supplier-id',
          tenantId: context.tenantId,
          branchId: context.branchId,
          deletedAt: null,
        },
      }),
    );
    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SupplierStatus.inactive,
          deletedAt: expect.any(Date),
        }),
      }),
    );
  });
});
