import { BadRequestException } from '@nestjs/common';
import {
  OrderPaymentMethod,
  OrderStatus,
  Role,
  SaleDocumentStatus,
  SaleDocumentType,
  SalePaymentStatus,
  SaleStatus,
  SystemMode,
  SystemType,
} from '@prisma/client';
import { SalesService } from './sales.service';

describe('SalesService', () => {
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Admin',
    fullName: 'Admin Teste',
    role: Role.Admin,
  } as any;

  const context = {
    userId: user.id,
    tenantId: '22222222-2222-2222-2222-222222222222',
    branchId: '33333333-3333-3333-3333-333333333333',
    role: Role.Admin,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    isDevSuperAdmin: false,
    contextKind: 'normal',
  } as any;

  const sale = {
    id: '44444444-4444-4444-4444-444444444444',
    tenantId: context.tenantId,
    branchId: context.branchId,
    orderId: null,
    source: null,
    idempotencyKey: null,
    cashSessionId: null,
    sellerId: user.id,
    sellerNameSnapshot: 'Admin Teste',
    paymentMethod: OrderPaymentMethod.pix,
    paymentMachineId: null,
    paymentMachineNameSnapshot: null,
    documentType: SaleDocumentType.receipt,
    documentNumber: null,
    status: SaleStatus.paid,
    subtotalCents: 3000,
    discountType: null,
    discountValue: null,
    discountCents: 0,
    totalCents: 3000,
    paidCents: 3000,
    changeCents: 0,
    soldAt: new Date('2026-06-12T10:00:00.000Z'),
    canceledAt: null,
    canceledById: null,
    cancellationReason: null,
    createdAt: new Date('2026-06-12T10:00:00.000Z'),
    updatedAt: new Date('2026-06-12T10:00:00.000Z'),
    deletedAt: null,
    items: [
      {
        id: '55555555-5555-5555-5555-555555555555',
        saleId: '44444444-4444-4444-4444-444444444444',
        productId: '66666666-6666-6666-6666-666666666666',
        productNameSnapshot: 'Produto',
        skuSnapshot: 'SKU-1',
        barcodeSnapshot: null,
        quantity: 2,
        unitPriceCents: 1500,
        totalPriceCents: 3000,
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
      },
    ],
    payments: [
      {
        id: '77777777-7777-7777-7777-777777777777',
        saleId: '44444444-4444-4444-4444-444444444444',
        paymentMethod: OrderPaymentMethod.pix,
        paymentMachineId: null,
        paymentMachineNameSnapshot: null,
        paymentMachineProvider: null,
        paymentMachineModel: null,
        paymentMachineFeePercent: null,
        externalProvider: null,
        externalReference: null,
        amountCents: 3000,
        status: SalePaymentStatus.approved,
        paidAt: new Date('2026-06-12T10:00:00.000Z'),
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
      },
    ],
    documents: [
      {
        id: '88888888-8888-8888-8888-888888888888',
        saleId: '44444444-4444-4444-4444-444444444444',
        type: SaleDocumentType.receipt,
        number: null,
        series: null,
        accessKey: null,
        status: SaleDocumentStatus.authorized,
        xmlPath: null,
        pdfPath: null,
        issuedAt: new Date('2026-06-12T10:00:00.000Z'),
        canceledAt: null,
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
        updatedAt: new Date('2026-06-12T10:00:00.000Z'),
      },
    ],
  };

  function makeService(contextOverride: Record<string, unknown> = {}) {
    const tx: any = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Admin',
          fullName: 'Admin Teste',
        }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '66666666-6666-6666-6666-666666666666',
            name: 'Produto',
            sku: 'SKU-1',
            barcode: null,
            salePriceCents: 1500,
            quantity: 10,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentMachine: {
        findFirst: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      sale: {
        create: jest.fn().mockResolvedValue(sale),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((input: any) => {
        if (typeof input === 'function') return input(tx);
        return Promise.all(input);
      }),
      sale: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([sale]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(sale),
      },
      saleDocument: {
        create: jest.fn(),
      },
    };
    const tenantContext = {
      resolve: jest.fn().mockResolvedValue({ ...context, ...contextOverride }),
    } as any;
    const storage = {
      createSignedSaleDocumentUrl: jest.fn(),
    } as any;

    return {
      service: new SalesService(prisma, tenantContext, storage),
      prisma,
      tx,
      tenantContext,
      storage,
    };
  }

  it('lista vendas somente pelo tenant e branch resolvidos', async () => {
    const { service, prisma, tenantContext } = makeService();

    await expect(service.findAll(user, {})).resolves.toMatchObject({
      items: [expect.objectContaining({ id: sale.id })],
      total: 1,
    });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: context.tenantId,
          branchId: context.branchId,
          deletedAt: null,
        }),
      }),
    );
    expect(tenantContext.resolve).toHaveBeenCalledWith(
      user,
      expect.not.objectContaining({ expectedSystemType: expect.anything() }),
    );
  });

  it('permite historico no modo Pet Shop sem remover o escopo de filial', async () => {
    const { service, prisma, tenantContext } = makeService({
      systemType: SystemType.petshop,
      mode: SystemMode.petshop,
    });

    await expect(service.findAll(user, {})).resolves.toMatchObject({
      items: [expect.objectContaining({ id: sale.id })],
    });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: context.tenantId,
          branchId: context.branchId,
        }),
      }),
    );
    expect(tenantContext.resolve).toHaveBeenCalledWith(
      user,
      expect.not.objectContaining({ expectedSystemType: expect.anything() }),
    );
  });

  it('venda direta baixa estoque uma unica vez na transacao', async () => {
    const { service, tx } = makeService();

    await expect(
      service.create(user, {
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        paymentMethod: OrderPaymentMethod.pix,
        items: [
          {
            productId: '66666666-6666-6666-6666-666666666666',
            quantity: 2,
          },
        ],
      }),
    ).resolves.toMatchObject({
      ok: true,
      sale: { id: sale.id, totalCents: 3000 },
    });

    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: '66666666-6666-6666-6666-666666666666',
        tenantId: context.tenantId,
        branchId: context.branchId,
        quantity: { gte: 2 },
      },
      data: { quantity: { decrement: 2 } },
    });
  });

  it('converte pedido em Sale sem baixar estoque novamente', async () => {
    const { service, tx } = makeService();
    tx.order.findFirst.mockResolvedValueOnce({
      id: '99999999-9999-9999-9999-999999999999',
      tenantId: context.tenantId,
      branchId: context.branchId,
      paymentMethod: OrderPaymentMethod.pix,
      status: OrderStatus.pending,
      subtotalCents: 3000,
      discountCents: 0,
      totalCents: 3000,
      items: sale.items.map((item) => ({
        ...item,
        product: {
          ncm: '23091000',
          cfopDefault: '5102',
          unit: 'UN',
          origin: '0',
          cest: null,
        },
      })),
    });
    tx.sale.create.mockResolvedValueOnce({
      ...sale,
      orderId: '99999999-9999-9999-9999-999999999999',
    });

    await expect(
      service.createFromOrder(
        user,
        '99999999-9999-9999-9999-999999999999',
      ),
    ).resolves.toMatchObject({
      ok: true,
      idempotent: false,
      sale: {
        orderId: '99999999-9999-9999-9999-999999999999',
      },
    });

    expect(tx.product.findMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OrderStatus.paid }),
      }),
    );
  });

  it('retorna a mesma Sale quando orderId ja foi convertido', async () => {
    const { service, prisma, tx } = makeService();
    prisma.sale.findFirst.mockResolvedValueOnce({
      ...sale,
      orderId: '99999999-9999-9999-9999-999999999999',
    });

    await expect(
      service.createFromOrder(
        user,
        '99999999-9999-9999-9999-999999999999',
      ),
    ).resolves.toMatchObject({ idempotent: true });
    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('NFC-e estrutural nasce draft e nunca autorizada por simulacao', async () => {
    const { service, prisma } = makeService();
    prisma.sale.findFirst.mockResolvedValueOnce(sale);
    prisma.saleDocument.create.mockResolvedValueOnce({
      ...sale.documents[0],
      type: SaleDocumentType.nfce65,
      status: SaleDocumentStatus.draft,
    });

    await expect(
      service.createFiscalDocument(user, sale.id, 'nfce65', {
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recipient: {
          name: 'Cliente Fiscal',
          documentType: 'cpf',
          document: '52998224725',
          ieIndicator: '9',
          street: 'Rua Teste',
          number: '10',
          district: 'Centro',
          city: 'Sao Paulo',
          cityCodeIbge: '3550308',
          state: 'SP',
          zipCode: '01001000',
        },
      }),
    ).resolves.toMatchObject({
      document: {
        type: SaleDocumentType.nfce65,
        status: SaleDocumentStatus.draft,
      },
      fiscalProviderPending: true,
    });
    expect(prisma.saleDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SaleDocumentStatus.draft,
        }),
      }),
    );
  });

  it('rejeita venda direta com produto fora do contexto', async () => {
    const { service, tx } = makeService();
    tx.product.findMany.mockResolvedValueOnce([]);

    await expect(
      service.create(user, {
        idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        paymentMethod: OrderPaymentMethod.pix,
        items: [
          {
            productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retorna venda existente para a mesma idempotency key sem baixar estoque', async () => {
    const { service, prisma, tx } = makeService();
    prisma.sale.findFirst.mockResolvedValueOnce({
      ...sale,
      idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });

    await expect(
      service.create(user, {
        idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        paymentMethod: OrderPaymentMethod.pix,
        items: [
          {
            productId: '66666666-6666-6666-6666-666666666666',
            quantity: 2,
          },
        ],
      }),
    ).resolves.toMatchObject({ idempotent: true, sale: { id: sale.id } });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it('persiste valor pago e troco em pagamento em dinheiro', async () => {
    const { service, tx } = makeService();
    tx.sale.create.mockImplementationOnce(({ data }: any) => ({
      ...sale,
      ...data,
      id: sale.id,
      soldAt: sale.soldAt,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      canceledAt: null,
      canceledById: null,
      cancellationReason: null,
      deletedAt: null,
      items: sale.items,
      payments: sale.payments,
      documents: sale.documents,
    }));

    await expect(
      service.create(user, {
        idempotencyKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        paymentMethod: OrderPaymentMethod.cash,
        paidCents: 5000,
        items: [
          {
            productId: '66666666-6666-6666-6666-666666666666',
            quantity: 2,
          },
        ],
      }),
    ).resolves.toMatchObject({
      sale: { paidCents: 5000, changeCents: 2000 },
    });
  });

  it('exige maquininha ativa para cartao', async () => {
    const { service } = makeService();

    await expect(
      service.create(user, {
        idempotencyKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        paymentMethod: OrderPaymentMethod.credit_card,
        paidCents: 3000,
        items: [
          {
            productId: '66666666-6666-6666-6666-666666666666',
            quantity: 2,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limita desconto de vendedor a dez por cento', async () => {
    const { service } = makeService({ role: Role.Vendedor });

    await expect(
      service.create(user, {
        idempotencyKey: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        paymentMethod: OrderPaymentMethod.pix,
        discountType: 'percentage' as any,
        discountValue: 11,
        items: [
          {
            productId: '66666666-6666-6666-6666-666666666666',
            quantity: 2,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
