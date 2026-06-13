import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MachineStatus,
  OrderStatus,
  Prisma,
  Role,
  SaleDocumentStatus,
  SaleDocumentType,
  SalePaymentStatus,
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

const SALE_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const } },
  documents: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.SaleInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;
type PrismaTx = Prisma.TransactionClient;

const READ_ROLES = [Role.Admin, Role.Vendedor];
const WRITE_ROLES = [Role.Admin, Role.Vendedor];

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: SupabaseStorageService,
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
    const sale = await this.findScopedSale(context.tenantId, context.branchId!, id);
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
        dto.paymentMachineId,
      );
      const subtotalCents = pricedItems.reduce(
        (sum, item) => sum + item.totalPriceCents,
        0,
      );
      const discountCents = Math.min(dto.discountCents ?? 0, subtotalCents);
      const totalCents = subtotalCents - discountCents;
      const amountCents = dto.amountCents ?? totalCents;

      if (amountCents < totalCents) {
        throw new BadRequestException('O pagamento aprovado nao cobre o total da venda.');
      }

      await this.decrementStock(
        tx,
        context.tenantId,
        context.branchId!,
        pricedItems,
      );

      const documentType = dto.documentType ?? SaleDocumentType.receipt;
      const documentStatus =
        documentType === SaleDocumentType.receipt
          ? SaleDocumentStatus.authorized
          : SaleDocumentStatus.draft;

      return tx.sale.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId!,
          sellerId: context.userId,
          sellerNameSnapshot: sellerName,
          paymentMethod: dto.paymentMethod,
          paymentMachineId: paymentMachine?.id,
          paymentMachineNameSnapshot: paymentMachine?.name,
          documentType,
          status: SaleStatus.paid,
          subtotalCents,
          discountCents,
          totalCents,
          items: {
            create: pricedItems.map((item) => ({
              productId: item.productId,
              productNameSnapshot: item.productNameSnapshot,
              skuSnapshot: item.skuSnapshot,
              barcodeSnapshot: item.barcodeSnapshot,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              totalPriceCents: item.totalPriceCents,
            })),
          },
          payments: {
            create: {
              paymentMethod: dto.paymentMethod,
              paymentMachineId: paymentMachine?.id,
              paymentMachineNameSnapshot: paymentMachine?.name,
              amountCents,
              status: SalePaymentStatus.approved,
              paidAt: new Date(),
            },
          },
          documents: {
            create: {
              type: documentType,
              status: documentStatus,
              issuedAt:
                documentType === SaleDocumentType.receipt ? new Date() : null,
            },
          },
        },
        include: SALE_INCLUDE,
      });
    });

    return { ok: true, sale: this.formatSale(sale) };
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
          include: { items: { orderBy: { createdAt: 'asc' } } },
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
        const paymentMachine = await this.loadPaymentMachine(
          tx,
          context.tenantId,
          context.branchId!,
          dto.paymentMachineId,
        );
        const paymentMethod = dto.paymentMethod ?? order.paymentMethod;
        const amountCents = dto.amountCents ?? order.totalCents;
        if (amountCents < order.totalCents) {
          throw new BadRequestException(
            'O pagamento aprovado nao cobre o total do pedido.',
          );
        }

        const documentType = dto.documentType ?? SaleDocumentType.receipt;
        const documentStatus =
          documentType === SaleDocumentType.receipt
            ? SaleDocumentStatus.authorized
            : SaleDocumentStatus.draft;

        const created = await tx.sale.create({
          data: {
            tenantId: context.tenantId,
            branchId: context.branchId!,
            orderId: order.id,
            sellerId: context.userId,
            sellerNameSnapshot: sellerName,
            paymentMethod,
            paymentMachineId: paymentMachine?.id,
            paymentMachineNameSnapshot: paymentMachine?.name,
            documentType,
            status: SaleStatus.paid,
            subtotalCents: order.subtotalCents,
            discountCents: order.discountCents,
            totalCents: order.totalCents,
            items: {
              create: order.items.map((item) => ({
                productId: item.productId,
                productNameSnapshot: item.productNameSnapshot,
                skuSnapshot: item.skuSnapshot,
                barcodeSnapshot: item.barcodeSnapshot,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                totalPriceCents: item.totalPriceCents,
              })),
            },
            payments: {
              create: {
                paymentMethod,
                paymentMachineId: paymentMachine?.id,
                paymentMachineNameSnapshot: paymentMachine?.name,
                amountCents,
                status: SalePaymentStatus.approved,
                paidAt: new Date(),
              },
            },
            documents: {
              create: {
                type: documentType,
                status: documentStatus,
                issuedAt:
                  documentType === SaleDocumentType.receipt ? new Date() : null,
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
    const sale = await this.findScopedSale(context.tenantId, context.branchId!, id);
    const formatted = this.formatSale(sale);

    return {
      ok: true,
      receipt: {
        title: 'NextStock - Recibo de Venda',
        sale: formatted,
      },
      html: this.buildReceiptHtml(formatted),
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
    return {
      ok: true,
      receipt: {
        title: 'NextStock - Recibo de Venda',
        sale: formatted,
      },
      html: this.buildReceiptHtml(formatted),
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
    const sale = await this.findScopedSale(context.tenantId, context.branchId!, id);
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
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const sale = await this.findScopedSale(context.tenantId, context.branchId!, id);
    if (sale.status !== SaleStatus.paid) {
      throw new BadRequestException(
        'Documento fiscal so pode ser preparado para venda paga.',
      );
    }

    const document = await this.prisma.saleDocument.create({
      data: {
        saleId: sale.id,
        type:
          type === 'nfe55'
            ? SaleDocumentType.nfe55
            : SaleDocumentType.nfce65,
        number: clean(dto.number),
        series: clean(dto.series),
        accessKey: clean(dto.accessKey),
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
    const sale = await this.findScopedSale(context.tenantId, context.branchId!, id);
    const document = sale.documents.find((item) => item.id === documentId);
    if (!document) {
      throw new NotFoundException('Documento da venda nao encontrado.');
    }

    const storagePath =
      format === 'xml'
        ? document.xmlPath
        : format === 'pdf'
          ? document.pdfPath
          : document.pdfPath ?? document.xmlPath;
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
        salePriceCents: true,
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
        throw new BadRequestException(`Estoque insuficiente para ${product.name}.`);
      }
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        barcodeSnapshot: product.barcode,
        quantity: item.quantity,
        unitPriceCents: product.salePriceCents,
        totalPriceCents: product.salePriceCents * item.quantity,
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
    paymentMachineId?: string,
  ) {
    if (!paymentMachineId) {
      return null;
    }
    const machine = await tx.paymentMachine.findFirst({
      where: {
        id: paymentMachineId,
        tenantId,
        branchId,
        status: MachineStatus.ativa,
      },
      select: { id: true, name: true },
    });
    if (!machine) {
      throw new BadRequestException(
        'Maquina de pagamento nao pertence a filial atual ou esta inativa.',
      );
    }
    return machine;
  }

  private formatSale(sale: SaleWithRelations) {
    return {
      id: sale.id,
      orderId: sale.orderId,
      sellerId: sale.sellerId,
      sellerNameSnapshot: sale.sellerNameSnapshot,
      paymentMethod: sale.paymentMethod,
      paymentMachineId: sale.paymentMachineId,
      paymentMachineNameSnapshot: sale.paymentMachineNameSnapshot,
      documentType: sale.documentType,
      documentNumber: sale.documentNumber,
      status: sale.status,
      subtotalCents: sale.subtotalCents,
      discountCents: sale.discountCents,
      totalCents: sale.totalCents,
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
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalPriceCents: item.totalPriceCents,
        unitPrice: centsToMoneyNumber(item.unitPriceCents),
        totalPrice: centsToMoneyNumber(item.totalPriceCents),
      })),
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        paymentMethod: payment.paymentMethod,
        paymentMachineId: payment.paymentMachineId,
        paymentMachineNameSnapshot: payment.paymentMachineNameSnapshot,
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

  private buildReceiptHtml(sale: ReturnType<SalesService['formatSale']>) {
    const rows = sale.items
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.productNameSnapshot)}</td>
            <td>${item.quantity}</td>
            <td>${formatCurrency(item.unitPriceCents)}</td>
            <td>${formatCurrency(item.totalPriceCents)}</td>
          </tr>`,
      )
      .join('');

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Recibo ${escapeHtml(sale.id)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#172536;margin:32px}
    h1{font-size:22px;margin:0 0 8px}
    p{margin:4px 0}
    table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{border-bottom:1px solid #dbe4ea;padding:8px;text-align:left}
    .total{text-align:right;font-size:18px;font-weight:bold;margin-top:18px}
  </style>
</head>
<body>
  <h1>NextStock - Recibo de Venda</h1>
  <p>Venda: ${escapeHtml(sale.id)}</p>
  <p>Vendedor: ${escapeHtml(sale.sellerNameSnapshot)}</p>
  <p>Data: ${escapeHtml(sale.soldAt.toISOString())}</p>
  <p>Pagamento: ${escapeHtml(sale.paymentMethod)}</p>
  <table>
    <thead><tr><th>Produto</th><th>Qtd.</th><th>Unitario</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">Total: ${formatCurrency(sale.totalCents)}</p>
</body>
</html>`;
  }
}

function clean(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function centsToMoneyNumber(value: number) {
  return Number((value / 100).toFixed(2));
}

function formatCurrency(value: number) {
  return (value / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
