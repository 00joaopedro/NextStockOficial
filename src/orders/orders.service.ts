import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Order,
  OrderItem,
  OrderPaymentMethod,
  OrderStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { SalesService } from '../sales/sales.service';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

type OrderWithItems = Order & { items: OrderItem[] };
type PrismaTx = Prisma.TransactionClient;

const MUTATION_ROLES = [Role.Admin, Role.Vendedor];
const READ_ROLES = [Role.Admin, Role.Vendedor];
const FINAL_STATUSES = new Set<OrderStatus>([
  OrderStatus.paid,
  OrderStatus.canceled,
  OrderStatus.refunded,
]);

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly salesService: SalesService,
  ) {}

  async findAll(
    user: AuthenticatedUser | undefined,
    query: OrderQueryDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, false);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(context.tenantId, context.branchId!, query);

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { items: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: orders.map((order) => this.formatOrder(order)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, false);
    const order = await this.findScopedOrder(context.tenantId, context.branchId!, id);
    return { order: this.formatOrder(order) };
  }

  async create(
    user: AuthenticatedUser | undefined,
    dto: CreateOrderDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    const normalizedItems = this.normalizeItems(dto.items);

    const order = await this.prisma.$transaction(async (tx) => {
      const pricedItems = await this.loadPricedItems(
        tx,
        context.tenantId,
        context.branchId!,
        normalizedItems,
      );
      const subtotalCents = pricedItems.reduce(
        (sum, item) => sum + item.totalPriceCents,
        0,
      );
      const discountCents = Math.min(dto.discountCents ?? 0, subtotalCents);
      const totalCents = Math.max(subtotalCents - discountCents, 0);
      const status = OrderStatus.pending;

      const created = await tx.order.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId!,
          customerName: dto.customerName.trim(),
          customerDocument: clean(dto.customerDocument),
          customerPhone: clean(dto.customerPhone),
          customerEmail: clean(dto.customerEmail)?.toLowerCase() ?? null,
          paymentMethod: dto.paymentMethod ?? OrderPaymentMethod.other,
          status,
          subtotalCents,
          discountCents,
          totalCents,
          notes: clean(dto.notes),
          deliveredAt: null,
          canceledAt: null,
          cancellationReason: null,
          createdById: user?.id,
          updatedById: user?.id,
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
        },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });

      await this.applyStockDelta(tx, context.tenantId, context.branchId!, pricedItems.map((item) => ({
        productId: item.productId,
        delta: -item.quantity,
      })));

      return created;
    });

    return { ok: true, order: this.formatOrder(order) };
  }

  async update(
    user: AuthenticatedUser | undefined,
    id: string,
    dto: UpdateOrderDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);

    const order = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findScopedOrder(
        context.tenantId,
        context.branchId!,
        id,
        tx,
      );
      this.assertMutable(existing);
      const data = this.buildUpdateData(dto, user?.id);

      if (dto.items) {
        const normalizedItems = this.normalizeItems(dto.items);
        const pricedItems = await this.loadPricedItems(
          tx,
          context.tenantId,
          context.branchId!,
          normalizedItems,
        );
        const stockDiff = this.buildStockDiff(existing.items, pricedItems);
        const subtotalCents = pricedItems.reduce(
          (sum, item) => sum + item.totalPriceCents,
          0,
        );
        const discountCents = Math.min(dto.discountCents ?? existing.discountCents, subtotalCents);

        await this.applyStockDelta(tx, context.tenantId, context.branchId!, stockDiff);
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        data.subtotalCents = subtotalCents;
        data.discountCents = discountCents;
        data.totalCents = Math.max(subtotalCents - discountCents, 0);
        data.items = {
          create: pricedItems.map((item) => ({
            productId: item.productId,
            productNameSnapshot: item.productNameSnapshot,
            skuSnapshot: item.skuSnapshot,
            barcodeSnapshot: item.barcodeSnapshot,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalPriceCents: item.totalPriceCents,
          })),
        };
      } else if (dto.discountCents !== undefined) {
        const discountCents = Math.min(dto.discountCents, existing.subtotalCents);
        data.discountCents = discountCents;
        data.totalCents = Math.max(existing.subtotalCents - discountCents, 0);
      }

      return tx.order.update({
        where: { id, tenantId: context.tenantId, branchId: context.branchId! },
        data,
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
    });

    return { ok: true, order: this.formatOrder(order) };
  }

  async updateStatus(
    user: AuthenticatedUser | undefined,
    id: string,
    dto: UpdateOrderStatusDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (dto.status === OrderStatus.canceled) {
      return this.cancel(user, id, { cancellationReason: dto.cancellationReason }, selectedBranchId, devContextMode);
    }

    if (dto.status === OrderStatus.delivered) {
      return this.deliver(user, id, selectedBranchId, devContextMode);
    }

    if (dto.status === OrderStatus.paid) {
      const saleResult = await this.salesService.createFromOrder(
        user,
        id,
        {},
        selectedBranchId,
        devContextMode,
      );
      const { order } = await this.findOne(
        user,
        id,
        selectedBranchId,
        devContextMode,
      );
      return { ok: true, order, sale: saleResult.sale };
    }

    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    const existing = await this.findScopedOrder(context.tenantId, context.branchId!, id);
    this.assertStatusTransition(existing.status, dto.status);

    const order = await this.prisma.order.update({
      where: { id, tenantId: context.tenantId, branchId: context.branchId! },
      data: {
        status: dto.status,
        updatedById: user?.id,
      },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    return { ok: true, order: this.formatOrder(order) };
  }

  async deliver(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    const existing = await this.findScopedOrder(context.tenantId, context.branchId!, id);

    if (existing.status === OrderStatus.canceled) {
      throw new BadRequestException('Pedido cancelado nao pode ser entregue.');
    }

    const order = await this.prisma.order.update({
      where: { id, tenantId: context.tenantId, branchId: context.branchId! },
      data: {
        status: OrderStatus.delivered,
        deliveredAt: existing.deliveredAt ?? new Date(),
        updatedById: user?.id,
      },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    return { ok: true, order: this.formatOrder(order) };
  }

  async cancel(
    user: AuthenticatedUser | undefined,
    id: string,
    dto: CancelOrderDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);

    const order = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findScopedOrder(
        context.tenantId,
        context.branchId!,
        id,
        tx,
      );

      if (existing.status === OrderStatus.canceled) {
        throw new BadRequestException('Pedido ja esta cancelado.');
      }

      const paidSale = await tx.sale.findFirst({
        where: {
          orderId: id,
          tenantId: context.tenantId,
          branchId: context.branchId!,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (paidSale) {
        throw new BadRequestException(
          'Pedido pago possui venda vinculada. Cancele a venda pelo historico.',
        );
      }

      await this.applyStockDelta(tx, context.tenantId, context.branchId!, existing.items.map((item) => ({
        productId: item.productId,
        delta: item.quantity,
      })));

      return tx.order.update({
        where: { id, tenantId: context.tenantId, branchId: context.branchId! },
        data: {
          status: OrderStatus.canceled,
          canceledAt: new Date(),
          cancellationReason: clean(dto.cancellationReason),
          updatedById: user?.id,
        },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
    });

    return { ok: true, order: this.formatOrder(order) };
  }

  async remove(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode, true);
    await this.findScopedOrder(context.tenantId, context.branchId!, id);

    await this.prisma.order.update({
      where: { id, tenantId: context.tenantId, branchId: context.branchId! },
      data: { deletedAt: new Date(), updatedById: user?.id },
    });

    return { ok: true };
  }

  async receipt(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const saleReceipt = await this.salesService.receiptByOrder(
      user,
      id,
      selectedBranchId,
      devContextMode,
    );
    if (saleReceipt) {
      return saleReceipt;
    }

    const { order } = await this.findOne(user, id, selectedBranchId, devContextMode);
    return {
      ok: true,
      receipt: {
        title: 'NextStock - Recibo do Pedido',
        order,
      },
    };
  }

  async nfeDraft(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const { order } = await this.findOne(user, id, selectedBranchId, devContextMode);
    return {
      ok: true,
      orderId: order.id,
      customer: {
        name: order.customerName,
        document: order.customerDocument,
        phone: order.customerPhone,
        email: order.customerEmail,
      },
      items: order.items.map((item) => ({
        productId: item.productId,
        descricao: item.productNameSnapshot,
        codigo: item.skuSnapshot || item.barcodeSnapshot || item.productId,
        quantidade: item.quantity,
        unitario: centsToMoneyNumber(item.unitPriceCents),
        total: centsToMoneyNumber(item.totalPriceCents),
      })),
      totals: {
        subtotal: centsToMoneyNumber(order.subtotalCents),
        discount: centsToMoneyNumber(order.discountCents),
        total: centsToMoneyNumber(order.totalCents),
      },
    };
  }

  private async resolveContext(
    user: AuthenticatedUser | undefined,
    selectedBranchId: string | undefined,
    devContextMode: string | undefined,
    writable: boolean,
  ) {
    return this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable,
      allowedRoles: writable ? MUTATION_ROLES : READ_ROLES,
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
  }

  private buildWhere(tenantId: string, branchId: string, query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      tenantId,
      branchId,
      deletedAt: null,
    };

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
        { customerDocument: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.minTotal !== undefined) {
      where.totalCents = { gte: Math.round(query.minTotal * 100) };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.createdAtFrom || query.createdAtTo) {
      where.createdAt = {
        ...(query.createdAtFrom ? { gte: new Date(query.createdAtFrom) } : {}),
        ...(query.createdAtTo ? { lte: new Date(query.createdAtTo) } : {}),
      };
    }

    return where;
  }

  private async findScopedOrder(
    tenantId: string,
    branchId: string,
    id: string,
    prisma: PrismaTx | PrismaService = this.prisma,
  ) {
    const order = await prisma.order.findFirst({
      where: { id, tenantId, branchId, deletedAt: null },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    if (!order) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    return order;
  }

  private normalizeItems(items: CreateOrderItemDto[]) {
    const byProduct = new Map<string, number>();

    items.forEach((item) => {
      byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
    });

    return Array.from(byProduct.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }

  private async loadPricedItems(
    tx: PrismaTx,
    tenantId: string,
    branchId: string,
    items: CreateOrderItemDto[],
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
    const productById = new Map(products.map((product) => [product.id, product]));

    return items.map((item) => {
      const product = productById.get(item.productId);

      if (!product) {
        throw new BadRequestException('Produto do pedido nao pertence a filial atual.');
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

  private async applyStockDelta(
    tx: PrismaTx,
    tenantId: string,
    branchId: string,
    deltas: Array<{ productId: string; delta: number }>,
  ) {
    for (const delta of deltas) {
      const result = await tx.product.updateMany({
        where: {
          id: delta.productId,
          tenantId,
          branchId,
          ...(delta.delta < 0 ? { quantity: { gte: Math.abs(delta.delta) } } : {}),
        },
        data: {
          quantity: { increment: delta.delta },
        },
      });

      if (result.count !== 1) {
        throw new BadRequestException('Estoque insuficiente para concluir o pedido.');
      }
    }
  }

  private buildStockDiff(
    currentItems: OrderItem[],
    nextItems: Array<{ productId: string; quantity: number }>,
  ) {
    const current = new Map<string, number>();
    const next = new Map<string, number>();

    currentItems.forEach((item) => {
      current.set(item.productId, (current.get(item.productId) ?? 0) + item.quantity);
    });
    nextItems.forEach((item) => {
      next.set(item.productId, (next.get(item.productId) ?? 0) + item.quantity);
    });

    const productIds = new Set([...current.keys(), ...next.keys()]);
    return Array.from(productIds).map((productId) => ({
      productId,
      delta: (current.get(productId) ?? 0) - (next.get(productId) ?? 0),
    })).filter((item) => item.delta !== 0);
  }

  private buildUpdateData(dto: UpdateOrderDto, userId?: string) {
    const data: Prisma.OrderUpdateInput = {};
    if (userId) data.updatedBy = { connect: { id: userId } };

    if (dto.customerName !== undefined) data.customerName = dto.customerName.trim();
    if (dto.customerDocument !== undefined) data.customerDocument = clean(dto.customerDocument);
    if (dto.customerPhone !== undefined) data.customerPhone = clean(dto.customerPhone);
    if (dto.customerEmail !== undefined) data.customerEmail = clean(dto.customerEmail)?.toLowerCase() ?? null;
    if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
    if (dto.notes !== undefined) data.notes = clean(dto.notes);

    return data;
  }

  private assertMutable(order: OrderWithItems) {
    if (FINAL_STATUSES.has(order.status)) {
      throw new BadRequestException(
        'Pedido pago, cancelado ou estornado nao pode ser alterado.',
      );
    }

    if (order.status === OrderStatus.delivered) {
      throw new BadRequestException('Pedido entregue nao pode ser alterado.');
    }
  }

  private assertStatusTransition(current: OrderStatus, next: OrderStatus) {
    if (current === OrderStatus.canceled) {
      throw new BadRequestException('Pedido cancelado nao pode mudar de status.');
    }

    if (current === OrderStatus.delivered && next !== OrderStatus.refunded) {
      throw new BadRequestException('Pedido entregue so pode ser estornado.');
    }
  }

  private formatOrder(order: OrderWithItems) {
    return {
      id: order.id,
      customerName: order.customerName,
      customerDocument: order.customerDocument,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      paymentMethod: order.paymentMethod,
      status: order.status,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      subtotal: centsToMoneyNumber(order.subtotalCents),
      discount: centsToMoneyNumber(order.discountCents),
      total: centsToMoneyNumber(order.totalCents),
      notes: order.notes,
      deliveredAt: order.deliveredAt,
      canceledAt: order.canceledAt,
      cancellationReason: order.cancellationReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
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
    };
  }
}

function clean(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function centsToMoneyNumber(value: number) {
  return Number((value / 100).toFixed(2));
}
