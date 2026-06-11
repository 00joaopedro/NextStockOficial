import { BadRequestException } from '@nestjs/common';
import {
  ExpenseFileType,
  ExpenseStatus,
  ExpenseType,
  Role,
  SupplierStatus,
  SystemMode,
  SystemType,
} from '@prisma/client';
import { ExpensesService } from './expenses.service';

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

const expenseRecord = {
  id: 'expense-id',
  tenantId: context.tenantId,
  branchId: context.branchId,
  type: ExpenseType.written,
  status: ExpenseStatus.pending,
  totalCents: 15000,
  date: new Date('2026-06-10T00:00:00.000Z'),
  employeeName: 'Mariana',
  storeName: 'Distribuidora Norte',
  supplierId: null,
  supplierNameSnapshot: null,
  notes: null,
  createdById: context.userId,
  updatedById: context.userId,
  deletedAt: null,
  createdAt: new Date('2026-06-10T10:00:00.000Z'),
  updatedAt: new Date('2026-06-10T10:00:00.000Z'),
  supplier: null,
  items: [
    {
      id: 'item-id',
      expenseId: 'expense-id',
      productName: 'Papel A4',
      units: 2,
      totalCostCents: 15000,
      productId: null,
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
    },
  ],
  files: [],
};

const expenseFile = {
  id: 'file-id',
  expenseId: 'expense-id',
  tenantId: context.tenantId,
  branchId: context.branchId,
  fileName: 'nota.pdf',
  mimeType: 'application/pdf',
  fileType: ExpenseFileType.pdf,
  fileSize: 123,
  storagePath: 'tenant-id/branch-id/expenses/expense-id/file.pdf',
  fileUrl: 'https://storage.test/file.pdf',
  createdAt: new Date('2026-06-10T10:00:00.000Z'),
  deletedAt: null,
};

function makeService(overrides: Record<string, any> = {}) {
  const prisma = {
    expense: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([expenseRecord]),
      findFirst: jest.fn().mockResolvedValue(expenseRecord),
      create: jest.fn().mockResolvedValue(expenseRecord),
      update: jest.fn().mockResolvedValue(expenseRecord),
    },
    expenseItem: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    expenseFile: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(expenseFile),
      findFirst: jest.fn().mockResolvedValue(expenseFile),
      update: jest.fn().mockResolvedValue(expenseFile),
    },
    supplier: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((arg) => Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
    ...overrides.prisma,
  };
  const tenantContext = {
    resolve: jest.fn().mockResolvedValue(context),
    ...overrides.tenantContext,
  };
  const storage = {
    uploadExpenseFile: jest.fn().mockResolvedValue({
      fileName: 'nota.pdf',
      mimeType: 'application/pdf',
      fileType: ExpenseFileType.pdf,
      fileSize: 123,
      storagePath: expenseFile.storagePath,
      fileUrl: expenseFile.fileUrl,
    }),
    removeExpenseFile: jest.fn().mockResolvedValue(undefined),
    getExpenseFileUrl: jest.fn().mockResolvedValue(expenseFile.fileUrl),
    ...overrides.storage,
  };

  return {
    service: new ExpensesService(prisma as any, tenantContext as any, storage as any),
    prisma,
    tenantContext,
    storage,
  };
}

describe('ExpensesService', () => {
  it('lista despesas somente do tenant e branch resolvidos', async () => {
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
    expect(prisma.expense.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: context.tenantId,
        branchId: context.branchId,
        deletedAt: null,
      }),
    });
    expect(result.items).toHaveLength(1);
  });

  it('cria nota escrita usando tenant/branch do backend e total calculado pelos itens', async () => {
    const { service, prisma } = makeService();

    await service.create(
      { id: 'admin-id', email: 'admin@test.com' } as any,
      {
        type: ExpenseType.written,
        totalCents: 999999,
        date: '2026-06-10',
        employeeName: 'Mariana',
        storeName: 'Distribuidora Norte',
        items: [
          { productName: 'Papel A4', units: 2, totalCostCents: 15000 },
        ],
      },
      'branch-id',
    );

    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: context.tenantId,
          branchId: context.branchId,
          totalCents: 15000,
          createdById: context.userId,
          updatedById: context.userId,
        }),
      }),
    );
  });

  it('bloqueia fornecedor de outra filial ou bloqueado', async () => {
    const { service } = makeService({
      prisma: {
        supplier: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'supplier-id',
            legalName: 'Bloqueado',
            status: SupplierStatus.blocked,
          }),
        },
      },
    });

    await expect(
      service.create(
        { id: 'admin-id', email: 'admin@test.com' } as any,
        {
          type: ExpenseType.upload,
          totalCents: 1000,
          date: '2026-06-10',
          employeeName: 'Mariana',
          storeName: 'Fornecedor',
          supplierId: 'supplier-id',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('envia arquivo de despesa validando despesa no escopo atual', async () => {
    const { service, prisma, storage } = makeService();

    await service.uploadFile(
      { id: 'admin-id', email: 'admin@test.com' } as any,
      'expense-id',
      { originalname: 'nota.pdf', mimetype: 'application/pdf', buffer: Buffer.from('pdf'), size: 3 },
      'branch-id',
    );

    expect(prisma.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'expense-id',
          tenantId: context.tenantId,
          branchId: context.branchId,
          deletedAt: null,
        },
      }),
    );
    expect(storage.uploadExpenseFile).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: context.tenantId,
        branchId: context.branchId,
        expenseId: 'expense-id',
      }),
    );
    expect(prisma.expenseFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expenseId: 'expense-id',
          tenantId: context.tenantId,
          branchId: context.branchId,
        }),
      }),
    );
  });

  it('bloqueia mais de 5 arquivos ativos por despesa', async () => {
    const { service } = makeService({
      prisma: {
        expenseFile: {
          count: jest.fn().mockResolvedValue(5),
          create: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
      },
    });

    await expect(
      service.uploadFile(
        { id: 'admin-id', email: 'admin@test.com' } as any,
        'expense-id',
        { originalname: 'nota.pdf', mimetype: 'application/pdf', buffer: Buffer.from('pdf'), size: 3 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
