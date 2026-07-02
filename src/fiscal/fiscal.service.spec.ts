import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FiscalEnvironment,
  OrderStatus,
  Role,
  SaleDocumentStatus,
  SaleDocumentType,
  SaleStatus,
  SystemMode,
  SystemType,
} from '@prisma/client';
import { FiscalService } from './fiscal.service';

describe('FiscalService', () => {
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    role: Role.Admin,
  } as any;
  const context = {
    userId: user.id,
    tenantId: '22222222-2222-2222-2222-222222222222',
    branchId: '33333333-3333-3333-3333-333333333333',
    role: Role.Admin,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
  };

  function makeService() {
    const prisma: any = {
      order: { findFirst: jest.fn() },
      sale: { findFirst: jest.fn() },
      saleDocument: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      companyFiscalConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const tenantContext = {
      resolve: jest.fn().mockResolvedValue(context),
    } as any;
    const validation = {
      assertSaleEligible: jest.fn(),
      assertConfig: jest.fn(),
      assertRecipient: jest.fn(),
      assertItems: jest.fn(),
      sanitizeProviderPayload: jest.fn((value) => value || {}),
      digits: jest.fn((value) => String(value || '').replace(/\D/g, '')),
    } as any;
    const sequence = { allocate: jest.fn() } as any;
    const storage = { createSignedUrl: jest.fn() } as any;
    const mockProvider = {
      name: 'mock',
      isRealProvider: false,
      sendNfe55: jest.fn(),
      queryStatus: jest.fn(),
      cancel: jest.fn(),
    } as any;
    return {
      service: new FiscalService(
        prisma,
        tenantContext,
        validation,
        sequence,
        storage,
        mockProvider,
      ),
      prisma,
      tenantContext,
      validation,
      sequence,
      mockProvider,
    };
  }

  it('draft por orderId usa tenant e branch resolvidos pelo backend', async () => {
    const { service, prisma } = makeService();
    prisma.companyFiscalConfig.findUnique.mockResolvedValue(null);
    prisma.order.findFirst.mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      status: OrderStatus.pending,
      customerName: 'Cliente',
      customerDocument: '52998224725',
      customerPhone: null,
      customerEmail: null,
      subtotalCents: 1000,
      discountCents: 0,
      totalCents: 1000,
      sale: null,
      items: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          productId: '66666666-6666-6666-6666-666666666666',
          productNameSnapshot: 'Produto',
          skuSnapshot: null,
          barcodeSnapshot: null,
          quantity: 1,
          unitPriceCents: 1000,
          totalPriceCents: 1000,
          product: {
            ncm: '23091000',
            cfopDefault: '5102',
            unit: 'UN',
            origin: '0',
            cest: null,
            icmsRate: null,
            ipiRate: null,
            pisRate: null,
            cofinsRate: null,
          },
        },
      ],
    });

    await service.getNfe55Draft(user, {
      orderId: '44444444-4444-4444-4444-444444444444',
    });

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: context.tenantId,
          branchId: context.branchId,
        }),
      }),
    );
  });

  it('retorna o mesmo documento para a mesma idempotency key', async () => {
    const { service, prisma } = makeService();
    prisma.saleDocument.findFirst.mockResolvedValue({
      id: '77777777-7777-7777-7777-777777777777',
      saleId: '88888888-8888-8888-8888-888888888888',
      orderId: null,
      type: SaleDocumentType.nfe55,
      model: '55',
      environment: FiscalEnvironment.homologacao,
      number: null,
      series: '1',
      accessKey: null,
      protocol: null,
      provider: 'mock',
      providerRef: null,
      status: SaleDocumentStatus.draft,
      errorMessage: null,
      issuedAt: null,
      sentAt: null,
      canceledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      xmlPath: null,
      pdfPath: null,
      normalizedPayload: {},
      items: [],
      events: [],
    });

    await expect(
      service.createDocument(user, {
        saleId: '88888888-8888-8888-8888-888888888888',
        idempotencyKey: '99999999-9999-4999-8999-999999999999',
        recipient: {} as any,
      }),
    ).resolves.toMatchObject({ idempotent: true });
    expect(prisma.sale.findFirst).not.toHaveBeenCalled();
  });

  it('provider mock nao transmite em ambiente fiscal de producao', async () => {
    const { service, prisma, sequence } = makeService();
    prisma.saleDocument.findFirst.mockResolvedValue({
      id: '77777777-7777-7777-7777-777777777777',
      saleId: '88888888-8888-8888-8888-888888888888',
      orderId: null,
      type: SaleDocumentType.nfe55,
      model: '55',
      environment: FiscalEnvironment.producao,
      number: null,
      series: '1',
      accessKey: null,
      protocol: null,
      provider: 'mock',
      providerRef: null,
      status: SaleDocumentStatus.draft,
      errorMessage: null,
      issuedAt: null,
      sentAt: null,
      canceledAt: null,
      cancellationReason: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      xmlPath: null,
      pdfPath: null,
      normalizedPayload: {},
      items: [],
      events: [],
      sale: {
        status: SaleStatus.paid,
        order: null,
        items: [],
        payments: [],
      },
    });
    prisma.companyFiscalConfig.findUnique.mockResolvedValue({
      environment: FiscalEnvironment.producao,
      provider: 'mock',
    });

    await expect(
      service.sendDocument(user, '77777777-7777-7777-7777-777777777777', {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(sequence.allocate).not.toHaveBeenCalled();
  });

  it('nao converte automaticamente venda com recibo interno em NF-e 55', async () => {
    const { service, prisma } = makeService();
    prisma.saleDocument.findFirst.mockResolvedValueOnce(null);
    prisma.sale.findFirst.mockResolvedValueOnce({
      id: '88888888-8888-8888-8888-888888888888',
      status: SaleStatus.paid,
      order: null,
      payments: [],
      items: [],
      documents: [
        {
          id: 'receipt-id',
          type: SaleDocumentType.receipt,
          status: SaleDocumentStatus.internal_issued,
        },
      ],
    });

    await expect(
      service.createDocument(user, {
        saleId: '88888888-8888-8888-8888-888888888888',
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recipient: {} as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
