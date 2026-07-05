import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Expense,
  ExpenseFile,
  ExpenseFileType,
  ExpenseItem,
  ExpenseStatus,
  ExpenseType,
  Prisma,
  Role,
  SupplierStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreateExpenseDto, CreateExpenseItemDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateExpenseStatusDto } from './dto/update-expense-status.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

type ExpenseContext = {
  userId: string;
  tenantId: string;
  branchId: string | null;
};

type ExpenseWithRelations = Expense & {
  items: ExpenseItem[];
  files: ExpenseFile[];
  supplier?: { id: string; legalName: string; tradeName: string | null } | null;
};

const READ_ROLES = [Role.Admin, Role.Vendedor, Role.Comprador];
const MUTATION_ROLES = [Role.Admin, Role.Comprador];
const ADMIN_ROLES = [Role.Admin];
const MAX_ACTIVE_FILES = 5;
const FINAL_STATUSES = new Set<ExpenseStatus>([ExpenseStatus.canceled, ExpenseStatus.paid]);

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async findAll(
    user: Express.AuthenticatedUser | undefined,
    query: ExpenseQueryDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, false, READ_ROLES);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const where = this.buildWhere(context, query);

    const [total, expenses] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: this.defaultInclude(),
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: expenses.map((expense) => this.formatExpense(expense)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, false, READ_ROLES);
    const expense = await this.findScopedExpenseOrThrow(id, context);
    return { expense: this.formatExpense(expense) };
  }

  async create(
    user: Express.AuthenticatedUser | undefined,
    dto: CreateExpenseDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true, MUTATION_ROLES);
    const supplier = await this.resolveSupplier(dto.supplierId, context);
    const items = await this.normalizeItems(dto.items ?? [], dto.type, context);
    const totalCents = dto.type === ExpenseType.written
      ? items.reduce((sum, item) => sum + item.totalCostCents, 0)
      : dto.totalCents;

    const expense = await this.prisma.expense.create({
      data: {
        tenantId: context.tenantId,
        branchId: context.branchId!,
        type: dto.type,
        status: dto.status ?? ExpenseStatus.pending,
        totalCents,
        date: new Date(dto.date),
        employeeName: cleanRequired(dto.employeeName, 'employeeName'),
        storeName: cleanRequired(dto.storeName, 'storeName'),
        supplierId: supplier?.id ?? null,
        supplierNameSnapshot: supplier?.legalName ?? null,
        notes: clean(dto.notes),
        createdById: context.userId,
        updatedById: context.userId,
        items: items.length
          ? {
              create: items.map((item) => ({
                productName: item.productName,
                units: item.units,
                totalCostCents: item.totalCostCents,
                productId: item.productId,
              })),
            }
          : undefined,
      },
      include: this.defaultInclude(),
    });

    return { ok: true, expense: this.formatExpense(expense) };
  }

  async update(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdateExpenseDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true, MUTATION_ROLES);

    const expense = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findScopedExpenseOrThrow(id, context, tx);
      this.assertMutable(existing);
      const nextType = dto.type ?? existing.type;
      const items = dto.items
        ? await this.normalizeItems(dto.items, nextType, context, tx)
        : undefined;
      const supplier = dto.supplierId !== undefined
        ? await this.resolveSupplier(dto.supplierId, context, tx)
        : undefined;

      const data: Prisma.ExpenseUpdateInput = {
        updatedBy: { connect: { id: context.userId } },
      };

      if (dto.type !== undefined) data.type = dto.type;
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.totalCents !== undefined) data.totalCents = dto.totalCents;
      if (dto.date !== undefined) data.date = new Date(dto.date);
      if (dto.employeeName !== undefined) data.employeeName = cleanRequired(dto.employeeName, 'employeeName');
      if (dto.storeName !== undefined) data.storeName = cleanRequired(dto.storeName, 'storeName');
      if (dto.notes !== undefined) data.notes = clean(dto.notes);
      if (supplier !== undefined) {
        data.supplier = supplier ? { connect: { id: supplier.id } } : { disconnect: true };
        data.supplierNameSnapshot = supplier?.legalName ?? null;
      }

      if (items !== undefined) {
        await tx.expenseItem.deleteMany({ where: { expenseId: existing.id } });
        data.items = items.length
          ? {
              create: items.map((item) => ({
                productName: item.productName,
                units: item.units,
                totalCostCents: item.totalCostCents,
                productId: item.productId,
              })),
            }
          : undefined;
        data.totalCents = nextType === ExpenseType.written
          ? items.reduce((sum, item) => sum + item.totalCostCents, 0)
          : dto.totalCents ?? existing.totalCents;
      }

      return tx.expense.update({
        where: { id: existing.id },
        data,
        include: this.defaultInclude(),
      });
    });

    return { ok: true, expense: this.formatExpense(expense) };
  }

  async updateStatus(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdateExpenseStatusDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true, ADMIN_ROLES);
    const existing = await this.findScopedExpenseOrThrow(id, context);
    if (existing.deletedAt) {
      throw new BadRequestException('Despesa deletada nao pode mudar de status.');
    }

    const expense = await this.prisma.expense.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        updatedById: context.userId,
      },
      include: this.defaultInclude(),
    });

    return { ok: true, expense: this.formatExpense(expense) };
  }

  async remove(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true, ADMIN_ROLES);
    const existing = await this.findScopedExpenseOrThrow(id, context);

    await this.prisma.expense.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        updatedById: context.userId,
      },
    });

    return { ok: true };
  }

  async uploadFile(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    file: any,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true, MUTATION_ROLES);
    const expense = await this.findScopedExpenseOrThrow(id, context);
    this.assertMutable(expense);

    const activeFiles = await this.prisma.expenseFile.count({
      where: {
        expenseId: expense.id,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
    });
    if (activeFiles >= MAX_ACTIVE_FILES) {
      throw new BadRequestException('Cada despesa pode ter no maximo 5 arquivos ativos.');
    }

    const uploaded = await this.storage.uploadExpenseFile({
      tenantId: context.tenantId,
      branchId: context.branchId!,
      expenseId: expense.id,
      ownerProfileId: context.userId,
      file,
    });

    try {
      const created = await this.prisma.expenseFile.create({
        data: {
          expenseId: expense.id,
          tenantId: context.tenantId,
          branchId: context.branchId!,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          fileType: uploaded.fileType,
          fileSize: uploaded.fileSize,
          originalSize: uploaded.originalSize,
          width: uploaded.width,
          height: uploaded.height,
          storagePath: uploaded.storagePath,
          fileUrl: uploaded.fileUrl,
        },
      });

      return { ok: true, file: this.formatFile(created) };
    } catch (error) {
      await this.storage.removeExpenseFile(uploaded.storagePath);
      throw error;
    }
  }

  async removeFile(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    fileId: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true, MUTATION_ROLES);
    await this.findScopedExpenseOrThrow(id, context);
    const file = await this.findScopedFileOrThrow(id, fileId, context);

    await this.storage.removeExpenseFile(file.storagePath);
    await this.prisma.expenseFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });

    return { ok: true };
  }

  async downloadFile(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    fileId: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, false, READ_ROLES);
    await this.findScopedExpenseOrThrow(id, context);
    const file = await this.findScopedFileOrThrow(id, fileId, context);
    const url = await this.storage.getExpenseFileUrl(file.storagePath);

    return { ok: true, url, file: this.formatFile({ ...file, fileUrl: url }) };
  }

  private resolveContext(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId: string | undefined,
    devContextMode: string | undefined,
    writable: boolean,
    allowedRoles: Role[],
  ) {
    return this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable,
      allowedRoles,
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
  }

  private buildWhere(context: ExpenseContext, query: ExpenseQueryDto): Prisma.ExpenseWhereInput {
    const search = clean(query.search);
    const where: Prisma.ExpenseWhereInput = {
      tenantId: context.tenantId,
      branchId: context.branchId!,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { employeeName: { contains: search, mode: 'insensitive' } },
        { storeName: { contains: search, mode: 'insensitive' } },
        { supplierNameSnapshot: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(`${query.date}T23:59:59.999Z`);
      where.date = { gte: start, lte: end };
    }

    if (query.minValue !== undefined) {
      where.totalCents = { gte: query.minValue };
    }

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    return where;
  }

  private async findScopedExpenseOrThrow(
    id: string,
    context: ExpenseContext,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const expense = await prisma.expense.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
      include: this.defaultInclude(),
    });

    if (!expense) {
      throw new NotFoundException('Despesa nao encontrada.');
    }

    return expense;
  }

  private async findScopedFileOrThrow(id: string, fileId: string, context: ExpenseContext) {
    const file = await this.prisma.expenseFile.findFirst({
      where: {
        id: fileId,
        expenseId: id,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
    });

    if (!file) {
      throw new NotFoundException('Arquivo da despesa nao encontrado.');
    }

    return file;
  }

  private async resolveSupplier(
    supplierId: string | null | undefined,
    context: ExpenseContext,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (supplierId === undefined) return undefined;
    if (!supplierId) return null;

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
      select: { id: true, legalName: true, status: true },
    });

    if (!supplier) {
      throw new BadRequestException('Fornecedor nao pertence a filial atual.');
    }

    if (supplier.status === SupplierStatus.blocked) {
      throw new BadRequestException('Fornecedor bloqueado nao pode ser usado em despesas.');
    }

    return supplier;
  }

  private async normalizeItems(
    items: CreateExpenseItemDto[],
    type: ExpenseType,
    context: ExpenseContext,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (type === ExpenseType.written && !items.length) {
      throw new BadRequestException('Nota escrita precisa ter pelo menos um item.');
    }

    if (type === ExpenseType.upload) {
      return [];
    }

    const productIds = items.map((item) => item.productId).filter(Boolean) as string[];
    const productSet = new Set<string>();

    if (productIds.length) {
      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          tenantId: context.tenantId,
          branchId: context.branchId!,
        },
        select: { id: true },
      });
      products.forEach((product) => productSet.add(product.id));
    }

    return items.map((item) => {
      if (item.productId && !productSet.has(item.productId)) {
        throw new BadRequestException('Produto da despesa nao pertence a filial atual.');
      }

      return {
        productName: cleanRequired(item.productName, 'productName'),
        units: item.units,
        totalCostCents: item.totalCostCents,
        productId: item.productId ?? null,
      };
    });
  }

  private assertMutable(expense: Expense) {
    if (FINAL_STATUSES.has(expense.status)) {
      throw new BadRequestException('Despesa paga/cancelada nao pode ser alterada.');
    }
  }

  private defaultInclude() {
    return {
      items: { orderBy: { createdAt: 'asc' } },
      files: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      supplier: { select: { id: true, legalName: true, tradeName: true } },
    } satisfies Prisma.ExpenseInclude;
  }

  private formatExpense(expense: ExpenseWithRelations) {
    return {
      id: expense.id,
      type: expense.type,
      status: expense.status,
      totalCents: expense.totalCents,
      total: centsToMoneyNumber(expense.totalCents),
      date: expense.date,
      employeeName: expense.employeeName,
      employee: expense.employeeName,
      storeName: expense.storeName,
      store: expense.storeName,
      supplierId: expense.supplierId,
      supplierNameSnapshot: expense.supplierNameSnapshot,
      supplier: expense.supplier ?? null,
      notes: expense.notes,
      deletedAt: expense.deletedAt,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      items: expense.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        name: item.productName,
        units: item.units,
        totalCostCents: item.totalCostCents,
        cost: centsToMoneyNumber(item.totalCostCents),
        productId: item.productId,
      })),
      products: expense.items.map((item) => ({
        id: item.id,
        name: item.productName,
        units: item.units,
        cost: centsToMoneyNumber(item.totalCostCents),
        productId: item.productId,
      })),
      files: expense.files.map((file) => this.formatFile(file)),
    };
  }

  private formatFile(file: ExpenseFile) {
    return {
      id: file.id,
      fileName: file.fileName,
      name: file.fileName,
      mimeType: file.mimeType,
      fileType: file.fileType,
      type: file.fileType,
      fileSize: file.fileSize,
      originalSize: file.originalSize,
      width: file.width,
      height: file.height,
      fileUrl: file.fileUrl,
      url: file.fileUrl,
      storagePath: file.storagePath,
      createdAt: file.createdAt,
      deletedAt: file.deletedAt,
    };
  }
}

function clean(value?: string | null) {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function cleanRequired(value: string | undefined, field: string) {
  const cleaned = clean(value);
  if (!cleaned) {
    throw new BadRequestException(`${field} is required`);
  }
  return cleaned;
}

function centsToMoneyNumber(value: number) {
  return Number((value / 100).toFixed(2));
}
