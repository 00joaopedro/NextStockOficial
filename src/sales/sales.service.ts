import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MachineStatus,
  OrderStatus,
  OrderPaymentMethod,
  Prisma,
  Role,
  SaleDiscountType,
  SaleDocumentStatus,
  SaleDocumentType,
  SalePaymentStatus,
  SaleSource,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { CreateSaleDocumentDto } from './dto/create-sale-document.dto';
import { CreateSaleFromOrderDto } from './dto/create-sale-from-order.dto';
import { CreateSaleDto, CreateSaleItemDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { InternalReceiptService } from './internal-receipt.service';

const SALE_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const } },
  documents: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.SaleInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{
  include: typeof SALE_INCLUDE;
}>;
type PrismaTx = Prisma.TransactionClient;

const READ_ROLES = [Role.Admin, Role.Vendedor];
const WRITE_ROLES = [Role.Admin, Role.Vendedor];

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: SupabaseStorageService,
    private readonly internalReceipt: InternalReceiptService,
  ) {}

  async findAll(
    user: Express.AuthenticatedUser | undefined,
    query: SaleQueryDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(context.tenantId, context.branchId!, query);

    const [total, sales] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: SALE_INCLUDE,
        orderBy: { soldAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: sales.map((sale) => this.formatSale(sale)),
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
    );
    const sale = await this.findScopedSale(
      context.tenantId,
      context.branchId!,
      id,
    );
    return { sale: this.formatSale(sale) };
  }

  async create(
    user: Express.AuthenticatedUser | undefined,
    dto: CreateSaleDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
    );
    const normalizedItems = this.normalizeItems(dto.items);
    const existing = await this.findByIdempotencyKey(
      context.tenantId,
      context.branchId!,
      dto.idempotencyKey,
    );
    if (existing) {
      return {
        ok: true,
        idempotent: true,
        paymentConfirmation: 'manual',
        sale: this.formatSale(existing),
      };
    }

    try {
      const sale = await this.prisma.$transaction(async (tx) => {
        const sellerName = await this.loadSellerName(tx, context.userId, user);
        const pricedItems = await this.loadPricedItems(
          tx,
          context.tenantId,
          context.branchId!,
          normalizedItems,
        );
        const paymentMachine = await this.loadPaymentMachine(
          tx,
          context.tenantId,
          context.branchId!,
          dto.paymentMethod,
          dto.paymentMachineId,
        );
        const subtotalCents = pricedItems.reduce(
          (sum, item) => sum + item.totalPriceCents,
          0,
        );
        const discount = this.calculateDiscount(
          dto,
          subtotalCents,
          context.role,
          context.isDevSuperAdmin,
        );
        const totalCents = subtotalCents - discount.discountCents;
        const paidCents = dto.paidCents ?? dto.amountCents ?? totalCents;
        const changeCents = this.validatePayment(
          dto.paymentMethod,
          paidCents,
          totalCents,
        );

        await this.decrementStock(
          tx,
          context.tenantId,
          context.branchId!,
          pricedItems,
        );

        return tx.sale.create({
          data: {
            tenantId: context.tenantId,
            branchId: context.branchId!,
            source: SaleSource.cash_register,
            idempotencyKey: dto.idempotencyKey,
            sellerId: context.userId,
            sellerNameSnapshot: sellerName,
            paymentMethod: dto.paymentMethod,
            paymentMachineId: paymentMachine?.id,
            paymentMachineNameSnapshot: paymentMachine?.name,
            documentType: SaleDocumentType.receipt,
            status: SaleStatus.paid,
            subtotalCents,
            discountType: discount.type,
            discountValue: discount.value,
            discountCents: discount.discountCents,
            totalCents,
            paidCents,
            changeCents,
            items: {
              create: pricedItems.map((item) => ({
                productId: item.productId,
                productNameSnapshot: item.productNameSnapshot,
                skuSnapshot: item.skuSnapshot,
                barcodeSnapshot: item.barcodeSnapshot,
                ncmSnapshot: item.ncmSnapshot,
                cfopSnapshot: item.cfopSnapshot,
                unitSnapshot: item.unitSnapshot,
                originSnapshot: item.originSnapshot,
                cestSnapshot: item.cestSnapshot,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                totalPriceCents: item.totalPriceCents,
                unitCostCentsSnapshot: item.unitCostCentsSnapshot,
                totalCostCentsSnapshot: item.totalCostCentsSnapshot,
              })),
            },
            payments: {
              create: {
                paymentMethod: dto.paymentMethod,
                paymentMachineId: paymentMachine?.id,
                paymentMachineNameSnapshot: paymentMachine?.name,
                paymentMachineProvider: paymentMachine?.provider,
                paymentMachineModel: paymentMachine?.model,
                paymentMachineFeePercent: paymentMachine?.feePercent,
                externalProvider: paymentMachine?.externalProvider,
                externalReference: paymentMachine?.externalReference,
                amountCents: totalCents,
                status: SalePaymentStatus.approved,
                paidAt: new Date(),
              },
            },
            documents: {
              create: {
                tenantId: context.tenantId,
                branchId: context.branchId!,
                type: SaleDocumentType.receipt,
                status: SaleDocumentStatus.internal_issued,
                issuedAt: new Date(),
                createdById: context.userId,
                updatedById: context.userId,
              },
            },
          },
          include: SALE_INCLUDE,
        });
      });

      return {
        ok: true,
        idempotent: false,
        paymentConfirmation: 'manual',
        sale: this.formatSale(sale),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findByIdempotencyKey(
          context.tenantId,
          context.branchId!,
          dto.idempotencyKey,
        );
        if (raced) {
          return {
            ok: true,
            idempotent: true,
            paymentConfirmation: 'manual',
            sale: this.formatSale(raced),
          };
        }
      }
      throw error;
    }
  }

  async createFromOrder(
    user: Express.AuthenticatedUser | undefined,
    orderId: string,
    dto: CreateSaleFromOrderDto = {},
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
    );

    const existing = await this.prisma.sale.findFirst({
      where: {
        orderId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
      include: SALE_INCLUDE,
    });
    if (existing) {
      return { ok: true, idempotent: true, sale: this.formatSale(existing) };
    }

    try {
      const sale = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            tenantId: context.tenantId,
            branchId: context.branchId!,
            deletedAt: null,
          },
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
              include: { product: true },
            },
          },
        });

        if (!order) {
          throw new NotFoundException('Pedido nao encontrado.');
        }
        if (
          order.status === OrderStatus.canceled ||
          order.status === OrderStatus.refunded
        ) {
          throw new BadRequestException(
            'Pedido cancelado ou estornado nao pode virar venda.',
          );
        }

        const sellerName = await this.loadSellerName(tx, context.userId, user);
        const paymentMethod = dto.paymentMethod ?? order.paymentMethod;
        const paymentMachine = await this.loadPaymentMachine(
          tx,
          context.tenantId,
          context.branchId!,
          paymentMethod,
          dto.paymentMachineId,
        );
        const amountCents = dto.amountCents ?? order.totalCents;
        const changeCents = this.validatePayment(
          paymentMethod,
          amountCents,
          order.totalCents,
        );

        const created = await tx.sale.create({
          data: {
            tenantId: context.tenantId,
            branchId: context.branchId!,
            orderId: order.id,
            source: SaleSource.order,
            sellerId: context.userId,
            sellerNameSnapshot: sellerName,
            paymentMethod,
            paymentMachineId: paymentMachine?.id,
            paymentMachineNameSnapshot: paymentMachine?.name,
            documentType: SaleDocumentType.receipt,
            status: SaleStatus.paid,
            subtotalCents: order.subtotalCents,
            discountCents: order.discountCents,
            totalCents: order.totalCents,
            paidCents: amountCents,
            changeCents,
            items: {
              create: order.items.map((item) => ({
                productId: item.productId,
                productNameSnapshot: item.productNameSnapshot,
                skuSnapshot: item.skuSnapshot,
                barcodeSnapshot: item.barcodeSnapshot,
                ncmSnapshot: item.product.ncm,
                cfopSnapshot: item.product.cfopDefault,
                unitSnapshot: item.product.unit,
                originSnapshot: item.product.origin,
                cestSnapshot: item.product.cest,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                totalPriceCents: item.totalPriceCents,
                unitCostCentsSnapshot: item.product.costPriceCents,
                totalCostCentsSnapshot:
                  item.product.costPriceCents * item.quantity,
              })),
            },
            payments: {
              create: {
                paymentMethod,
                paymentMachineId: paymentMachine?.id,
                paymentMachineNameSnapshot: paymentMachine?.name,
                paymentMachineProvider: paymentMachine?.provider,
                paymentMachineModel: paymentMachine?.model,
                paymentMachineFeePercent: paymentMachine?.feePercent,
                externalProvider: paymentMachine?.externalProvider,
                externalReference: paymentMachine?.externalReference,
                amountCents: order.totalCents,
                status: SalePaymentStatus.approved,
                paidAt: new Date(),
              },
            },
            documents: {
              create: {
                tenantId: context.tenantId,
                branchId: context.branchId!,
                orderId: order.id,
                type: SaleDocumentType.receipt,
                status: SaleDocumentStatus.internal_issued,
                issuedAt: new Date(),
                createdById: context.userId,
                updatedById: context.userId,
              },
            },
          },
          include: SALE_INCLUDE,
        });

        await tx.order.update({
          where: {
            id: order.id,
            tenantId: context.tenantId,
            branchId: context.branchId!,
          },
          data: {
            status:
              order.status === OrderStatus.delivered
                ? OrderStatus.delivered
                : OrderStatus.paid,
            updatedById: context.userId,
          },
        });

        return created;
      });

      return { ok: true, idempotent: false, sale: this.formatSale(sale) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.sale.findFirst({
          where: {
            orderId,
            tenantId: context.tenantId,
            branchId: context.branchId!,
            deletedAt: null,
          },
          include: SALE_INCLUDE,
        });
        if (raced) {
          return { ok: true, idempotent: true, sale: this.formatSale(raced) };
        }
      }
      throw error;
    }
  }

  async cancel(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: CancelSaleDto,
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
    const existing = await this.findScopedSale(
      context.tenantId,
      context.branchId!,
      id,
    );

    if (existing.status === SaleStatus.canceled) {
      throw new BadRequestException('Venda ja esta cancelada.');
    }
    if (existing.status === SaleStatus.refunded) {
      throw new BadRequestException('Venda estornada nao pode ser cancelada.');
    }

    const sale = await this.prisma.sale.update({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId!,
      },
      data: {
        status: SaleStatus.canceled,
        canceledAt: new Date(),
        canceledById: context.userId,
        cancellationReason: clean(dto.cancellationReason),
      },
      include: SALE_INCLUDE,
    });

    return {
      ok: true,
      sale: this.formatSale(sale),
      stockReversalPending: true,
      financialReversalPending: true,
    };
  }

  async receipt(
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
    );
    const sale = await this.findScopedSale(
      context.tenantId,
      context.branchId!,
      id,
    );
    const formatted = this.formatSale(sale);
    const printed = await this.internalReceipt.issueAndRender({
      sale,
      context: {
        userId: context.userId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
      },
      origin: 'history',
    });

    return {
      ok: true,
      receipt: {
        title: 'NextStock - Recibo de Venda',
        sale: formatted,
      },
      mode: 'internal_receipt',
      printable: true,
      documentId: printed.documentId,
      printEvent: printed.eventType,
      printNumber: printed.printNumber,
      html: printed.html,
    };
  }

  async receiptByOrder(
    user: Express.AuthenticatedUser | undefined,
    orderId: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const sale = await this.prisma.sale.findFirst({
      where: {
        orderId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
      include: SALE_INCLUDE,
    });
    if (!sale) {
      return null;
    }

    const formatted = this.formatSale(sale);
    const printed = await this.internalReceipt.issueAndRender({
      sale,
      context: {
        userId: context.userId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
      },
      origin: 'order',
    });
    return {
      ok: true,
      receipt: {
        title: 'NextStock - Recibo de Venda',
        sale: formatted,
      },
      mode: 'internal_receipt',
      printable: true,
      documentId: printed.documentId,
      printEvent: printed.eventType,
      printNumber: printed.printNumber,
      html: printed.html,
    };
  }

  async listDocuments(
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
    );
    const sale = await this.findScopedSale(
      context.tenantId,
      context.branchId!,
      id,
    );
    return {
      items: sale.documents.map((document) => this.formatDocument(document)),
    };
  }

  async createFiscalDocument(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    type: 'nfe55' | 'nfce65',
    dto: CreateSaleDocumentDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (type === 'nfe55') {
      throw new BadRequestException(
        'NF-e 55 deve ser criada pelo FiscalService para aplicar validacao, idempotencia e sequencia fiscal.',
      );
    }
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const sale = await this.findScopedSale(
      context.tenantId,
      context.branchId!,
      id,
    );
    if (sale.status !== SaleStatus.paid) {
      throw new BadRequestException(
        'Documento fiscal so pode ser preparado para venda paga.',
      );
    }

    const document = await this.prisma.saleDocument.create({
      data: {
        saleId: sale.id,
        type: SaleDocumentType.nfce65,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        orderId: sale.orderId,
        model: '65',
        provider: 'mock',
        idempotencyKey: dto.idempotencyKey,
        normalizedPayload: {
          recipient: dto.recipient,
          operationNature: clean(dto.operationNature),
          buyerPresence: dto.buyerPresence,
          finalConsumer: dto.finalConsumer,
          freightCents: dto.freightCents ?? 0,
          additionalInformation: clean(dto.additionalInformation),
        } as unknown as Prisma.InputJsonValue,
        createdById: context.userId,
        updatedById: context.userId,
        status: SaleDocumentStatus.draft,
      },
    });

    return {
      ok: true,
      document: this.formatDocument(document),
      fiscalProviderPending: true,
    };
  }

  async downloadDocument(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    documentId: string,
    format: 'pdf' | 'xml' | undefined,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const sale = await this.findScopedSale(
      context.tenantId,
      context.branchId!,
      id,
    );
    const document = sale.documents.find((item) => item.id === documentId);
    if (!document) {
      throw new NotFoundException('Documento da venda nao encontrado.');
    }

    const storagePath =
      format === 'xml'
        ? document.xmlPath
        : format === 'pdf'
          ? document.pdfPath
          : (document.pdfPath ?? document.xmlPath);
    if (!storagePath) {
      throw new NotFoundException(
        'Documento ainda nao possui arquivo fiscal armazenado.',
      );
    }

    return {
      documentId: document.id,
      format: storagePath === document.xmlPath ? 'xml' : 'pdf',
      signedUrl: await this.storage.createSignedSaleDocumentUrl(storagePath),
    };
  }

  private async resolveContext(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId: string | undefined,
    devContextMode: string | undefined,
    writable: boolean,
    allowedRoles: Role[] = writable ? WRITE_ROLES : READ_ROLES,
  ) {
    return this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable,
      allowedRoles,
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
  }

  private buildWhere(tenantId: string, branchId: string, query: SaleQueryDto) {
    const where: Prisma.SaleWhereInput = {
      tenantId,
      branchId,
      deletedAt: null,
    };

    if (query.seller?.trim()) {
      where.sellerNameSnapshot = {
        contains: query.seller.trim(),
        mode: 'insensitive',
      };
    }
    if (query.minValue !== undefined) {
      where.totalCents = { gte: Math.round(query.minValue * 100) };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.documentType) {
      where.OR = [
        { documentType: query.documentType },
        { documents: { some: { type: query.documentType } } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
      if (dateTo) {
        dateTo.setUTCHours(23, 59, 59, 999);
      }
      where.soldAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    return where;
  }

  private async findScopedSale(tenantId: string, branchId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId, branchId, deletedAt: null },
      include: SALE_INCLUDE,
    });
    if (!sale) {
      throw new NotFoundException('Venda nao encontrada.');
    }
    return sale;
  }

  private findByIdempotencyKey(
    tenantId: string,
    branchId: string,
    idempotencyKey: string,
  ) {
    return this.prisma.sale.findFirst({
      where: { tenantId, branchId, idempotencyKey, deletedAt: null },
      include: SALE_INCLUDE,
    });
  }

  private normalizeItems(items: CreateSaleItemDto[]) {
    const quantities = new Map<string, number>();
    items.forEach((item) => {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    });
    return Array.from(quantities, ([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }

  private async loadPricedItems(
    tx: PrismaTx,
    tenantId: string,
    branchId: string,
    items: CreateSaleItemDto[],
  ) {
    const products = await tx.product.findMany({
      where: {
        tenantId,
        branchId,
        id: { in: items.map((item) => item.productId) },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        ncm: true,
        cfopDefault: true,
        unit: true,
        origin: true,
        cest: true,
        salePriceCents: true,
        costPriceCents: true,
        quantity: true,
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    return items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          'Produto da venda nao pertence ao tenant/filial atual.',
        );
      }
      if (product.quantity < item.quantity) {
        throw new BadRequestException(
          `Estoque insuficiente para ${product.name}.`,
        );
      }
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        barcodeSnapshot: product.barcode,
        ncmSnapshot: product.ncm,
        cfopSnapshot: product.cfopDefault,
        unitSnapshot: product.unit,
        originSnapshot: product.origin,
        cestSnapshot: product.cest,
        quantity: item.quantity,
        unitPriceCents: product.salePriceCents,
        totalPriceCents: product.salePriceCents * item.quantity,
        unitCostCentsSnapshot: product.costPriceCents,
        totalCostCentsSnapshot: product.costPriceCents * item.quantity,
      };
    });
  }

  private async decrementStock(
    tx: PrismaTx,
    tenantId: string,
    branchId: string,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    for (const item of items) {
      const updated = await tx.product.updateMany({
        where: {
          id: item.productId,
          tenantId,
          branchId,
          quantity: { gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity } },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'Estoque insuficiente para concluir a venda.',
        );
      }
    }
  }

  private async loadSellerName(
    tx: PrismaTx,
    userId: string,
    user?: Express.AuthenticatedUser,
  ) {
    const profile = await tx.userProfile.findUnique({
      where: { id: userId },
      select: { name: true, fullName: true },
    });
    return (
      profile?.fullName?.trim() ||
      profile?.name?.trim() ||
      user?.fullName?.trim() ||
      user?.name?.trim() ||
      'Usuario NextStock'
    );
  }

  private async loadPaymentMachine(
    tx: PrismaTx,
    tenantId: string,
    branchId: string,
    paymentMethod: OrderPaymentMethod,
    paymentMachineId?: string,
  ) {
    const isCard =
      paymentMethod === OrderPaymentMethod.credit_card ||
      paymentMethod === OrderPaymentMethod.debit_card;

    if (isCard && !paymentMachineId) {
      throw new BadRequestException(
        'Pagamento com cartao exige uma maquininha ativa da filial.',
      );
    }
    if (!isCard && paymentMachineId) {
      throw new BadRequestException(
        'Maquininha so pode ser informada para pagamento com cartao.',
      );
    }
    if (!paymentMachineId) {
      return null;
    }
    const machine = await tx.paymentMachine.findFirst({
      where: {
        id: paymentMachineId,
        tenantId,
        branchId,
        status: MachineStatus.ativa,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        provider: true,
        model: true,
        feePercent: true,
        externalProvider: true,
        externalReference: true,
      },
    });
    if (!machine) {
      throw new BadRequestException(
        'Maquina de pagamento nao pertence a filial atual ou esta inativa.',
      );
    }
    return machine;
  }

  private calculateDiscount(
    dto: CreateSaleDto,
    subtotalCents: number,
    role: Role,
    isDevSuperAdmin: boolean,
  ) {
    const hasStructuredDiscount =
      dto.discountType !== undefined || dto.discountValue !== undefined;
    if (hasStructuredDiscount && dto.discountCents !== undefined) {
      throw new BadRequestException(
        'Informe desconto estruturado ou discountCents, nunca os dois.',
      );
    }
    if (
      (dto.discountType === undefined) !==
      (dto.discountValue === undefined)
    ) {
      throw new BadRequestException(
        'Tipo e valor do desconto devem ser informados juntos.',
      );
    }

    const adminLimit = role === Role.Admin || isDevSuperAdmin;
    const maxPercentage = adminLimit ? 100 : 10;
    const maxFixedCents = adminLimit
      ? subtotalCents
      : Math.floor(subtotalCents * 0.1);

    if (dto.discountType === SaleDiscountType.percentage) {
      const value = dto.discountValue!;
      if (value > maxPercentage) {
        throw new BadRequestException(
          `Desconto percentual excede o limite de ${maxPercentage}% para este usuario.`,
        );
      }
      return {
        type: SaleDiscountType.percentage,
        value: new Prisma.Decimal(value),
        discountCents: Math.round(subtotalCents * (value / 100)),
      };
    }

    if (dto.discountType === SaleDiscountType.fixed) {
      const value = dto.discountValue!;
      if (!Number.isInteger(value)) {
        throw new BadRequestException(
          'Desconto fixo deve ser informado em centavos inteiros.',
        );
      }
      if (value > subtotalCents) {
        throw new BadRequestException(
          'Desconto fixo nao pode ser maior que o subtotal.',
        );
      }
      if (value > maxFixedCents) {
        throw new BadRequestException(
          'Desconto fixo excede o limite permitido para este usuario.',
        );
      }
      return {
        type: SaleDiscountType.fixed,
        value: new Prisma.Decimal(value),
        discountCents: value,
      };
    }

    const legacyDiscount = dto.discountCents ?? 0;
    if (legacyDiscount > subtotalCents) {
      throw new BadRequestException(
        'Desconto nao pode ser maior que o subtotal.',
      );
    }
    if (legacyDiscount > maxFixedCents) {
      throw new BadRequestException(
        'Desconto excede o limite permitido para este usuario.',
      );
    }
    return {
      type: legacyDiscount > 0 ? SaleDiscountType.fixed : null,
      value: legacyDiscount > 0 ? new Prisma.Decimal(legacyDiscount) : null,
      discountCents: legacyDiscount,
    };
  }

  private validatePayment(
    method: OrderPaymentMethod,
    paidCents: number,
    totalCents: number,
  ) {
    if (paidCents < totalCents) {
      throw new BadRequestException(
        'O pagamento informado nao cobre o total da venda.',
      );
    }
    if (method !== OrderPaymentMethod.cash && paidCents !== totalCents) {
      throw new BadRequestException(
        'PIX e cartao devem usar exatamente o total da venda.',
      );
    }
    return paidCents - totalCents;
  }

  private formatSale(sale: SaleWithRelations) {
    return {
      id: sale.id,
      orderId: sale.orderId,
      source: sale.source,
      idempotencyKey: sale.idempotencyKey,
      cashSessionId: sale.cashSessionId,
      sellerId: sale.sellerId,
      sellerNameSnapshot: sale.sellerNameSnapshot,
      paymentMethod: sale.paymentMethod,
      paymentMachineId: sale.paymentMachineId,
      paymentMachineNameSnapshot: sale.paymentMachineNameSnapshot,
      documentType: sale.documentType,
      documentNumber: sale.documentNumber,
      status: sale.status,
      subtotalCents: sale.subtotalCents,
      discountType: sale.discountType,
      discountValue:
        sale.discountValue === null ? null : Number(sale.discountValue),
      discountCents: sale.discountCents,
      totalCents: sale.totalCents,
      paidCents: sale.paidCents ?? sale.totalCents,
      changeCents: sale.paidCents === null ? 0 : sale.changeCents,
      subtotal: centsToMoneyNumber(sale.subtotalCents),
      discount: centsToMoneyNumber(sale.discountCents),
      total: centsToMoneyNumber(sale.totalCents),
      soldAt: sale.soldAt,
      canceledAt: sale.canceledAt,
      canceledById: sale.canceledById,
      cancellationReason: sale.cancellationReason,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        name: item.productNameSnapshot,
        skuSnapshot: item.skuSnapshot,
        barcodeSnapshot: item.barcodeSnapshot,
        ncmSnapshot: item.ncmSnapshot,
        cfopSnapshot: item.cfopSnapshot,
        unitSnapshot: item.unitSnapshot,
        originSnapshot: item.originSnapshot,
        cestSnapshot: item.cestSnapshot,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalPriceCents: item.totalPriceCents,
        unitCostCentsSnapshot: item.unitCostCentsSnapshot,
        totalCostCentsSnapshot: item.totalCostCentsSnapshot,
        unitPrice: centsToMoneyNumber(item.unitPriceCents),
        totalPrice: centsToMoneyNumber(item.totalPriceCents),
      })),
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        paymentMethod: payment.paymentMethod,
        paymentMachineId: payment.paymentMachineId,
        paymentMachineNameSnapshot: payment.paymentMachineNameSnapshot,
        paymentMachineProvider: payment.paymentMachineProvider,
        paymentMachineModel: payment.paymentMachineModel,
        paymentMachineFeePercent:
          payment.paymentMachineFeePercent === null
            ? null
            : Number(payment.paymentMachineFeePercent),
        externalProvider: payment.externalProvider,
        externalReference: payment.externalReference,
        amountCents: payment.amountCents,
        amount: centsToMoneyNumber(payment.amountCents),
        status: payment.status,
        paidAt: payment.paidAt,
      })),
      documents: sale.documents.map((document) =>
        this.formatDocument(document),
      ),
    };
  }

  private formatDocument(document: {
    id: string;
    type: SaleDocumentType;
    number: string | null;
    series: string | null;
    accessKey: string | null;
    status: SaleDocumentStatus;
    xmlPath: string | null;
    pdfPath: string | null;
    issuedAt: Date | null;
    canceledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: document.id,
      type: document.type,
      number: document.number,
      series: document.series,
      accessKey: document.accessKey,
      status: document.status,
      hasXml: Boolean(document.xmlPath),
      hasPdf: Boolean(document.pdfPath),
      issuedAt: document.issuedAt,
      canceledAt: document.canceledAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

function clean(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function centsToMoneyNumber(value: number) {
  return Number((value / 100).toFixed(2));
}
