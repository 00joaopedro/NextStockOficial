import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderPaymentMethod, OrderStatus, Role, SystemMode, SystemType } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const user = {
    id: 'user-id',
    role: Role.Admin,
    tenantId: 'tenant-id',
    branchId: 'branch-id',
    allowedSystemTypes: [SystemType.padrao],
  } as any;

  const context: any = {
    userId: 'user-id',
    tenantId: 'tenant-id',
    branchId: 'branch-id',
    role: Role.Admin,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    isDevSuperAdmin: false,
    contextKind: 'normal',
  };

  const order = {
    id: 'order-id',
    tenantId: 'tenant-id',
    branchId: 'branch-id',
    customerName: 'Cliente Teste',
    customerDocument: null,
    customerPhone: null,
    customerEmail: 'cliente@test.com',
    paymentMethod: OrderPaymentMethod.pix,
    status: OrderStatus.pending,
    subtotalCents: 3000,
    discountCents: 0,
    totalCents: 3000,
    notes: null,
    deliveredAt: null,
    canceledAt: null,
    cancellationReason: null,
    createdById: 'user-id',
    updatedById: 'user-id',
    deletedAt: null,
    createdAt: new Date('2026-06-09T10:00:00.000Z'),
    updatedAt: new Date('2026-06-09T10:00:00.000Z'),
    items: [
      {
        id: 'item-id',
        orderId: 'order-id',
        productId: 'product-id',
        productNameSnapshot: 'Produto',
        skuSnapshot: 'SKU-1',
        barcodeSnapshot: null,
        quantity: 2,
        unitPriceCents: 1500,
        totalPriceCents: 3000,
        createdAt: new Date('2026-06-09T10:00:00.000Z'),
      },
    ],
  };

  function makeService(contextOverride: Record<string, unknown> = {}) {
    const tx: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-id',
            name: 'Produto',
            sku: 'SKU-1',
            barcode: null,
            salePriceCents: 1500,
            quantity: 5,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        create: jest.fn().mockResolvedValue(order),
        findFirst: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue(order),
      },
      orderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sale: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((input: any) => {
        if (typeof input === 'function') return input(tx);
        return Promise.all(input);
      }),
      order: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([order]),
        findFirst: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue(order),
      },
    };
    const tenantContext = {
      resolve: jest.fn().mockResolvedValue({ ...context, ...contextOverride }),
    } as any;
    const salesService = {
      createFromOrder: jest.fn(),
      receiptByOrder: jest.fn().mockResolvedValue(null),
    } as any;

    return {
      service: new OrdersService(prisma, tenantContext, salesService),
      prisma,
      tx,
      tenantContext,
      salesService,
    };
  }

  it('cria pedido real e baixa estoque na mesma transacao', async () => {
    const { service, tx, tenantContext } = makeService();

    await expect(
      service.create(user, {
        customerName: 'Cliente Teste',
        customerEmail: 'cliente@test.com',
        paymentMethod: OrderPaymentMethod.pix,
        items: [{ productId: 'product-id', quantity: 2 }],
      }),
    ).resolves.toMatchObject({
      ok: true,
      order: { id: 'order-id', total: 30 },
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-id',
          branchId: 'branch-id',
          subtotalCents: 3000,
          totalCents: 3000,
        }),
      }),
    );
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'product-id',
          tenantId: 'tenant-id',
          branchId: 'branch-id',
          quantity: { gte: 2 },
        }),
        data: { quantity: { increment: -2 } },
      }),
    );
    expect(tenantContext.resolve).toHaveBeenCalledWith(
      user,
      expect.not.objectContaining({ expectedSystemType: expect.anything() }),
    );
  });

  it('cria pedido em tenant Pet Shop sem bloquear por systemType', async () => {
    const { service, tx, tenantContext } = makeService({
      systemType: SystemType.petshop,
      mode: SystemMode.petshop,
    });

    await expect(
      service.create(
        { ...user, systemType: SystemType.petshop, allowedSystemTypes: [SystemType.petshop] },
        {
          customerName: 'Cliente Pet',
          paymentMethod: OrderPaymentMethod.pix,
          items: [{ productId: 'product-id', quantity: 1 }],
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      order: { id: 'order-id' },
    });

    expect(tenantContext.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ systemType: SystemType.petshop }),
      expect.not.objectContaining({ expectedSystemType: expect.anything() }),
    );
    expect(tx.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-id',
          branchId: 'branch-id',
        }),
      }),
    );
  });

  it('lista pedidos em tenant Pet Shop mantendo escopo por tenant e branch', async () => {
    const { service, prisma } = makeService({
      systemType: SystemType.petshop,
      mode: SystemMode.petshop,
    });

    await expect(
      service.findAll(
        { ...user, systemType: SystemType.petshop, allowedSystemTypes: [SystemType.petshop] },
        {},
      ),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'order-id' })],
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-id',
          branchId: 'branch-id',
        }),
      }),
    );
  });

  it('falha quando produto nao pertence ao tenant/branch atual', async () => {
    const { service, tx } = makeService();
    tx.product.findMany.mockResolvedValueOnce([]);

    await expect(
      service.create(user, {
        customerName: 'Cliente Teste',
        items: [{ productId: 'product-other', quantity: 1 }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falha com estoque insuficiente', async () => {
    const { service, tx } = makeService();
    tx.product.findMany.mockResolvedValueOnce([
      {
        id: 'product-id',
        name: 'Produto',
        sku: null,
        barcode: null,
        salePriceCents: 1500,
        quantity: 1,
      },
    ]);

    await expect(
      service.create(user, {
        customerName: 'Cliente Teste',
        items: [{ productId: 'product-id', quantity: 2 }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancelar pedido devolve estoque e marca canceledAt', async () => {
    const { service, tx } = makeService();
    tx.order.update.mockResolvedValueOnce({
      ...order,
      status: OrderStatus.canceled,
      canceledAt: new Date('2026-06-09T11:00:00.000Z'),
    });

    await expect(
      service.cancel(user, 'order-id', { cancellationReason: 'Cliente desistiu' }),
    ).resolves.toMatchObject({
      ok: true,
      order: { status: OrderStatus.canceled },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { quantity: { increment: 2 } },
      }),
    );
  });

  it('nao cancela pedido que ja possui Sale paga vinculada', async () => {
    const { service, tx } = makeService();
    tx.sale.findFirst.mockResolvedValueOnce({ id: 'sale-id' });

    await expect(
      service.cancel(user, 'order-id', {
        cancellationReason: 'Cancelamento solicitado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('entregar pedido muda status sem nova baixa de estoque', async () => {
    const { service, prisma } = makeService();
    prisma.order.update.mockResolvedValueOnce({
      ...order,
      status: OrderStatus.delivered,
      deliveredAt: new Date('2026-06-09T11:00:00.000Z'),
    });

    await expect(service.deliver(user, 'order-id')).resolves.toMatchObject({
      ok: true,
      order: { status: OrderStatus.delivered },
    });
  });

  it('confirmar pagamento cria Sale idempotente sem nova baixa de estoque', async () => {
    const { service, salesService, tx } = makeService();
    salesService.createFromOrder.mockResolvedValueOnce({
      ok: true,
      idempotent: false,
      sale: { id: 'sale-id', orderId: 'order-id' },
    });

    await expect(
      service.updateStatus(user, 'order-id', { status: OrderStatus.paid }),
    ).resolves.toMatchObject({
      ok: true,
      order: { id: 'order-id' },
      sale: { id: 'sale-id' },
    });

    expect(salesService.createFromOrder).toHaveBeenCalledWith(
      user,
      'order-id',
      {},
      undefined,
      undefined,
    );
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('nao encontra pedido fora do tenant/branch atual', async () => {
    const { service, prisma } = makeService();
    prisma.order.findFirst.mockResolvedValueOnce(null);

    await expect(service.findOne(user, 'order-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
