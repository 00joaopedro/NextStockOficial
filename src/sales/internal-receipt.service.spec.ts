import { SaleDocumentStatus, SaleDocumentType } from '@prisma/client';
import { InternalReceiptService } from './internal-receipt.service';

describe('InternalReceiptService', () => {
  const sale = {
    id: 'sale-a',
    orderId: null,
    sellerNameSnapshot: '<Operador>',
    paymentMethod: 'pix',
    paymentMachineNameSnapshot: null,
    subtotalCents: 3000,
    discountCents: 0,
    totalCents: 3000,
    paidCents: 3000,
    changeCents: 0,
    soldAt: new Date('2026-07-01T12:00:00.000Z'),
    items: [
      {
        productNameSnapshot: '<Produto & teste>',
        quantity: 2,
        unitPriceCents: 1500,
        totalPriceCents: 3000,
      },
    ],
  };
  const context = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
  };

  function setup(previousPrints = 0) {
    const tx: any = {
      saleDocument: {
        findFirst: jest.fn().mockResolvedValue({ id: 'receipt-a' }),
        create: jest.fn(),
        update: jest.fn(),
      },
      fiscalDocumentEvent: {
        count: jest.fn().mockResolvedValue(previousPrints),
        create: jest.fn(),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(tx)),
      companyFiscalConfig: {
        findUnique: jest.fn().mockResolvedValue({
          legalName: 'Empresa Teste',
          tradeName: null,
          cnpj: '11222333000181',
        }),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ name: 'Matriz' }),
      },
    };
    return {
      service: new InternalReceiptService(prisma),
      prisma,
      tx,
    };
  }

  it('emite recibo interno sem qualquer dado fiscal autorizado', async () => {
    const { service, tx } = setup();
    const result = await service.issueAndRender({
      sale,
      context,
      origin: 'cash_register',
    });

    expect(tx.saleDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SaleDocumentStatus.internal_issued,
          model: null,
          number: null,
          series: null,
          accessKey: null,
          protocol: null,
          provider: null,
          xmlPath: null,
          pdfPath: null,
        }),
      }),
    );
    expect(result.html).toContain('RECIBO INTERNO — SEM VALIDADE FISCAL');
    expect(result.html).toContain(
      'NÃO É NFC-e / NÃO É DOCUMENTO AUTORIZADO PELA SEFAZ',
    );
    expect(result.html).not.toContain('DANFE NFC-e');
    expect(result.html).not.toContain('QR Code SEFAZ');
    expect(result.html).not.toContain('<Produto & teste>');
    expect(result.html).toContain('&lt;Produto &amp; teste&gt;');
  });

  it('registra primeira impressao e reimpressao sem limite', async () => {
    const first = setup(0);
    await first.service.issueAndRender({
      sale,
      context,
      origin: 'cash_register',
    });
    expect(first.tx.fiscalDocumentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'internal_receipt_printed',
          status: SaleDocumentStatus.internal_issued,
          createdById: context.userId,
        }),
      }),
    );

    const reprint = setup(37);
    const result = await reprint.service.issueAndRender({
      sale,
      context,
      origin: 'history',
    });
    expect(result.eventType).toBe('internal_receipt_reprinted');
    expect(result.printNumber).toBe(38);
  });

  it('cria documento receipt isolado quando ainda nao existe', async () => {
    const { service, tx } = setup();
    tx.saleDocument.findFirst.mockResolvedValue(null);
    tx.saleDocument.create.mockResolvedValue({ id: 'new-receipt' });
    await service.issueAndRender({
      sale,
      context,
      origin: 'order',
    });
    expect(tx.saleDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: context.tenantId,
          branchId: context.branchId,
          type: SaleDocumentType.receipt,
          status: SaleDocumentStatus.internal_issued,
          accessKey: null,
          protocol: null,
        }),
      }),
    );
  });
});
