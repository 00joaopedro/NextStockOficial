import { SaleDocumentStatus, SaleDocumentType } from '@prisma/client';
import { InternalReceiptService } from './internal-receipt.service';

describe('InternalReceiptService RC-012', () => {
  const sale = {
    id: '00000000-0000-4000-8000-000000000101',
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
    userId: '00000000-0000-4000-8000-000000000102',
    tenantId: '00000000-0000-4000-8000-000000000103',
    branchId: '00000000-0000-4000-8000-000000000104',
  };

  function setup(numbers: number[] = [1]) {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      saleDocument: {
        findFirst: jest.fn().mockResolvedValue({ id: 'receipt-a' }),
        update: jest.fn(),
      },
      fiscalDocumentEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    numbers.forEach((printCounter) =>
      tx.saleDocument.update.mockResolvedValueOnce({ printCounter }),
    );
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(tx)),
      companyFiscalConfig: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            legalName: 'Empresa Teste',
            tradeName: null,
            cnpj: '11222333000181',
          }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ name: 'Matriz' }) },
    };
    return { service: new InternalReceiptService(prisma), prisma, tx };
  }

  it.each([
    [1, 'internal_receipt_printed'],
    [2, 'internal_receipt_reprinted'],
  ] as const)(
    'persiste e renderiza o numero atomico %i',
    async (number, eventType) => {
      const { service, tx } = setup([number]);
      const result = await service.issueAndRender({
        sale,
        context,
        origin: 'cash_register',
      });
      expect(tx.saleDocument.update).toHaveBeenCalledWith({
        where: expect.objectContaining({
          saleId: sale.id,
          tenantId: context.tenantId,
          branchId: context.branchId,
          type: SaleDocumentType.receipt,
        }),
        data: { printCounter: { increment: 1 } },
        select: { printCounter: true },
      });
      expect(tx.fiscalDocumentEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 'receipt-a',
          eventType,
          status: SaleDocumentStatus.internal_issued,
          printNumber: number,
          createdById: context.userId,
          requestPayload: expect.objectContaining({
            printNumber: number,
            tenantId: context.tenantId,
            branchId: context.branchId,
          }),
        }),
      });
      expect(result).toMatchObject({ printNumber: number, eventType });
      expect(result.html).toContain(`Via de impressão: ${number}`);
      expect(result.html).toContain('RECIBO INTERNO — SEM VALIDADE FISCAL');
      expect(result.html).toContain('&lt;Produto &amp; teste&gt;');
    },
  );

  it('usa ON CONFLICT no find-or-create e nao usa count + 1', async () => {
    const { service, tx } = setup();
    await service.issueAndRender({ sale, context, origin: 'order' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.fiscalDocumentEvent.count).toBeUndefined();
  });

  it('propaga falha do evento para rollback da transacao', async () => {
    const { service, tx, prisma } = setup();
    const failure = new Error('event insert failed');
    tx.fiscalDocumentEvent.create.mockRejectedValue(failure);
    await expect(
      service.issueAndRender({ sale, context, origin: 'history' }),
    ).rejects.toBe(failure);
    expect(prisma.companyFiscalConfig.findUnique).not.toHaveBeenCalled();
  });

  it('nao renderiza nem informa sucesso quando documento scoped nao e recuperado', async () => {
    const { service, tx } = setup();
    tx.saleDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.issueAndRender({ sale, context, origin: 'legacy' }),
    ).rejects.toThrow('scoped document');
    expect(tx.saleDocument.update).not.toHaveBeenCalled();
    expect(tx.fiscalDocumentEvent.create).not.toHaveBeenCalled();
  });
});
