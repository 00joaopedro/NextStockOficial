import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SupplierPersonType, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

type SupplierContext = {
  userId: string;
  tenantId: string;
  branchId: string | null;
};

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(
    user: Express.AuthenticatedUser | undefined,
    query: SupplierQueryDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
      [Role.Admin, Role.Vendedor, Role.Comprador],
    );
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const where = this.buildWhere(context, query);

    const [total, suppliers] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { legalName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.defaultInclude(),
      }),
    ]);

    return {
      items: suppliers.map((supplier) => this.formatSupplier(supplier)),
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
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
      [Role.Admin, Role.Vendedor, Role.Comprador],
    );
    const supplier = await this.findScopedSupplierOrThrow(id, context);

    return { supplier: this.formatSupplier(supplier) };
  }

  async create(
    user: Express.AuthenticatedUser | undefined,
    dto: CreateSupplierDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const data = this.normalizeCreateDto(dto);

    await this.assertDocumentUnique(data.document, context);

    const supplier = await this.prisma.supplier.create({
      data: {
        ...data,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        createdById: context.userId,
        updatedById: context.userId,
      },
      include: this.defaultInclude(),
    });

    return { supplier: this.formatSupplier(supplier) };
  }

  async update(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdateSupplierDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const current = await this.findScopedSupplierOrThrow(id, context);
    const data = this.normalizeUpdateDto(dto);
    const nextDocument = typeof data.document === 'string' ? data.document : undefined;

    if (nextDocument && nextDocument !== current.document) {
      await this.assertDocumentUnique(nextDocument, context, current.id);
    }

    const supplier = await this.prisma.supplier.update({
      where: { id: current.id },
      data: {
        ...data,
        updatedById: context.userId,
      },
      include: this.defaultInclude(),
    });

    return { supplier: this.formatSupplier(supplier) };
  }

  async updateStatus(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdateSupplierStatusDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const current = await this.findScopedSupplierOrThrow(id, context);
    const supplier = await this.prisma.supplier.update({
      where: { id: current.id },
      data: {
        status: dto.status,
        updatedById: context.userId,
      },
      include: this.defaultInclude(),
    });

    return { supplier: this.formatSupplier(supplier) };
  }

  async remove(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const current = await this.findScopedSupplierOrThrow(id, context);
    const supplier = await this.prisma.supplier.update({
      where: { id: current.id },
      data: {
        status: SupplierStatus.inactive,
        deletedAt: new Date(),
        updatedById: context.userId,
      },
      include: this.defaultInclude(),
    });

    return { supplier: this.formatSupplier(supplier) };
  }

  private async resolveContext(
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

  private buildWhere(
    context: SupplierContext,
    query: SupplierQueryDto,
  ): Prisma.SupplierWhereInput {
    const search = this.clean(query.search);
    const normalizedDocumentSearch = this.normalizeDocument(search);
    const searchConditions: Prisma.SupplierWhereInput[] = [];

    if (search) {
      searchConditions.push(
        { legalName: { contains: search, mode: 'insensitive' } },
        { tradeName: { contains: search, mode: 'insensitive' } },
        { mainContact: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      );

      if (normalizedDocumentSearch) {
        searchConditions.push({ document: { contains: normalizedDocumentSearch } });
      }
    }

    return {
      tenantId: context.tenantId,
      branchId: context.branchId!,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.personType ? { personType: query.personType } : {}),
      ...(searchConditions.length ? { OR: searchConditions } : {}),
    };
  }

  private async findScopedSupplierOrThrow(id: string, context: SupplierContext) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
      include: this.defaultInclude(),
    });

    if (!supplier) {
      throw new NotFoundException('Fornecedor nao encontrado.');
    }

    return supplier;
  }

  private async assertDocumentUnique(
    document: string | null | undefined,
    context: SupplierContext,
    exceptId?: string,
  ) {
    if (!document) {
      return;
    }

    const existing = await this.prisma.supplier.findFirst({
      where: {
        tenantId: context.tenantId,
        branchId: context.branchId!,
        document,
        deletedAt: null,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Documento ja cadastrado nesta filial.');
    }
  }

  private normalizeCreateDto(dto: CreateSupplierDto) {
    const legalName = this.cleanRequired(dto.legalName, 'legalName');
    const document = this.normalizeRequiredDocument(dto.document);
    const phone = this.cleanRequired(dto.phone, 'phone');

    return {
      legalName,
      tradeName: this.cleanNullable(dto.tradeName),
      personType: dto.personType,
      document,
      stateRegistration: this.cleanNullable(dto.stateRegistration),
      mainContact: this.cleanNullable(dto.mainContact),
      phone,
      whatsapp: this.cleanNullable(dto.whatsapp),
      email: this.cleanNullable(dto.email)?.toLowerCase() ?? null,
      site: this.cleanNullable(dto.site),
      zipCode: this.cleanNullable(dto.zipCode),
      city: this.cleanNullable(dto.city),
      state: this.cleanNullable(dto.state)?.toUpperCase() ?? null,
      district: this.cleanNullable(dto.district),
      street: this.cleanNullable(dto.street),
      number: this.cleanNullable(dto.number),
      complement: this.cleanNullable(dto.complement),
      averageDeliveryTime: this.cleanNullable(dto.averageDeliveryTime),
      productCategories: this.cleanNullable(dto.productCategories),
      paymentTerms: this.cleanNullable(dto.paymentTerms),
      status: dto.status ?? SupplierStatus.active,
      notes: this.cleanNullable(dto.notes),
    };
  }

  private normalizeUpdateDto(dto: UpdateSupplierDto): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (dto.legalName !== undefined) data.legalName = this.cleanRequired(dto.legalName, 'legalName');
    if (dto.tradeName !== undefined) data.tradeName = this.cleanNullable(dto.tradeName);
    if (dto.personType !== undefined) data.personType = dto.personType;
    if (dto.document !== undefined) data.document = this.normalizeRequiredDocument(dto.document);
    if (dto.stateRegistration !== undefined) data.stateRegistration = this.cleanNullable(dto.stateRegistration);
    if (dto.mainContact !== undefined) data.mainContact = this.cleanNullable(dto.mainContact);
    if (dto.phone !== undefined) data.phone = this.cleanRequired(dto.phone, 'phone');
    if (dto.whatsapp !== undefined) data.whatsapp = this.cleanNullable(dto.whatsapp);
    if (dto.email !== undefined) data.email = this.cleanNullable(dto.email)?.toLowerCase() ?? null;
    if (dto.site !== undefined) data.site = this.cleanNullable(dto.site);
    if (dto.zipCode !== undefined) data.zipCode = this.cleanNullable(dto.zipCode);
    if (dto.city !== undefined) data.city = this.cleanNullable(dto.city);
    if (dto.state !== undefined) data.state = this.cleanNullable(dto.state)?.toUpperCase() ?? null;
    if (dto.district !== undefined) data.district = this.cleanNullable(dto.district);
    if (dto.street !== undefined) data.street = this.cleanNullable(dto.street);
    if (dto.number !== undefined) data.number = this.cleanNullable(dto.number);
    if (dto.complement !== undefined) data.complement = this.cleanNullable(dto.complement);
    if (dto.averageDeliveryTime !== undefined) data.averageDeliveryTime = this.cleanNullable(dto.averageDeliveryTime);
    if (dto.productCategories !== undefined) data.productCategories = this.cleanNullable(dto.productCategories);
    if (dto.paymentTerms !== undefined) data.paymentTerms = this.cleanNullable(dto.paymentTerms);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = this.cleanNullable(dto.notes);

    return data;
  }

  private defaultInclude() {
    return {
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    } satisfies Prisma.SupplierInclude;
  }

  private formatSupplier(supplier: any) {
    return {
      id: supplier.id,
      tenantId: supplier.tenantId,
      branchId: supplier.branchId,
      legalName: supplier.legalName,
      tradeName: supplier.tradeName,
      personType: supplier.personType,
      document: supplier.document,
      stateRegistration: supplier.stateRegistration,
      mainContact: supplier.mainContact,
      phone: supplier.phone,
      whatsapp: supplier.whatsapp,
      email: supplier.email,
      site: supplier.site,
      zipCode: supplier.zipCode,
      city: supplier.city,
      state: supplier.state,
      district: supplier.district,
      street: supplier.street,
      number: supplier.number,
      complement: supplier.complement,
      averageDeliveryTime: supplier.averageDeliveryTime,
      productCategories: supplier.productCategories,
      paymentTerms: supplier.paymentTerms,
      status: supplier.status,
      notes: supplier.notes,
      deletedAt: supplier.deletedAt,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
      createdBy: supplier.createdBy
        ? { id: supplier.createdBy.id, name: supplier.createdBy.name, email: supplier.createdBy.email }
        : null,
      updatedBy: supplier.updatedBy
        ? { id: supplier.updatedBy.id, name: supplier.updatedBy.name, email: supplier.updatedBy.email }
        : null,
    };
  }

  private clean(value?: string | null) {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    return cleaned || '';
  }

  private cleanNullable(value?: string | null) {
    const cleaned = this.clean(value);
    return cleaned || null;
  }

  private cleanRequired(value: string | undefined, field: string) {
    const cleaned = this.clean(value);
    if (!cleaned) {
      throw new BadRequestException(`${field} is required`);
    }
    return cleaned;
  }

  private normalizeRequiredDocument(value: string | undefined) {
    const document = this.normalizeDocument(value);
    if (!document) {
      throw new BadRequestException('document is required');
    }
    return document;
  }

  private normalizeDocument(value?: string | null) {
    return String(value ?? '').replace(/\D+/g, '');
  }
}
