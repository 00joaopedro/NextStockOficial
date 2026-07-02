import { Injectable } from '@nestjs/common';
import { Prisma, SaleDocumentStatus, SaleDocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type InternalReceiptContext = {
  userId: string;
  tenantId: string;
  branchId: string;
};

export type InternalReceiptSale = {
  id: string;
  orderId: string | null;
  sellerNameSnapshot: string;
  paymentMethod: string;
  paymentMachineNameSnapshot: string | null;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number | null;
  changeCents: number;
  soldAt: Date;
  items: Array<{
    productNameSnapshot: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }>;
};

@Injectable()
export class InternalReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  async issueAndRender(input: {
    sale: InternalReceiptSale;
    context: InternalReceiptContext;
    origin: 'cash_register' | 'history' | 'order' | 'legacy';
  }) {
    const { sale, context } = input;
    const audit = await this.prisma.$transaction(async (tx) => {
      let document = await tx.saleDocument.findFirst({
        where: {
          saleId: sale.id,
          type: SaleDocumentType.receipt,
          deletedAt: null,
          OR: [
            {
              tenantId: context.tenantId,
              branchId: context.branchId,
            },
            {
              tenantId: null,
              branchId: null,
            },
          ],
        },
        select: { id: true },
      });

      if (!document) {
        document = await tx.saleDocument.create({
          data: {
            saleId: sale.id,
            tenantId: context.tenantId,
            branchId: context.branchId,
            orderId: sale.orderId,
            type: SaleDocumentType.receipt,
            model: null,
            environment: null,
            number: null,
            series: null,
            accessKey: null,
            protocol: null,
            provider: null,
            providerRef: null,
            status: SaleDocumentStatus.internal_issued,
            issuedAt: new Date(),
            createdById: context.userId,
            updatedById: context.userId,
          },
          select: { id: true },
        });
      } else {
        await tx.saleDocument.update({
          where: { id: document.id },
          data: {
            tenantId: context.tenantId,
            branchId: context.branchId,
            status: SaleDocumentStatus.internal_issued,
            model: null,
            environment: null,
            number: null,
            series: null,
            accessKey: null,
            protocol: null,
            provider: null,
            providerRef: null,
            xmlPath: null,
            pdfPath: null,
            updatedById: context.userId,
          },
        });
      }

      const previousPrints = await tx.fiscalDocumentEvent.count({
        where: {
          documentId: document.id,
          eventType: {
            in: ['internal_receipt_printed', 'internal_receipt_reprinted'],
          },
        },
      });
      const eventType =
        previousPrints === 0
          ? 'internal_receipt_printed'
          : 'internal_receipt_reprinted';
      await tx.fiscalDocumentEvent.create({
        data: {
          documentId: document.id,
          eventType,
          status: SaleDocumentStatus.internal_issued,
          requestPayload: {
            tenantId: context.tenantId,
            branchId: context.branchId,
            saleId: sale.id,
            origin: input.origin,
            printNumber: previousPrints + 1,
          } satisfies Prisma.InputJsonValue,
          createdById: context.userId,
        },
      });
      return {
        documentId: document.id,
        eventType,
        printNumber: previousPrints + 1,
      };
    });

    const [company, branch] = await Promise.all([
      this.prisma.companyFiscalConfig.findUnique({
        where: {
          tenantId_branchId: {
            tenantId: context.tenantId,
            branchId: context.branchId,
          },
        },
        select: { legalName: true, tradeName: true, cnpj: true },
      }),
      this.prisma.branch.findFirst({
        where: {
          id: context.branchId,
          tenantId: context.tenantId,
          isActive: true,
        },
        select: { name: true },
      }),
    ]);

    return {
      ...audit,
      html: this.buildHtml({
        sale,
        company,
        branchName: branch?.name || 'Filial',
        printNumber: audit.printNumber,
      }),
    };
  }

  private buildHtml(input: {
    sale: InternalReceiptSale;
    company: {
      legalName: string;
      tradeName: string | null;
      cnpj: string;
    } | null;
    branchName: string;
    printNumber: number;
  }) {
    const { sale, company } = input;
    const rows = sale.items
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.productNameSnapshot)}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.unitPriceCents)}</td>
          <td>${formatCurrency(item.totalPriceCents)}</td>
        </tr>`,
      )
      .join('');
    const companyName =
      company?.tradeName || company?.legalName || 'Empresa não configurada';

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Recibo interno ${escapeHtml(sale.id)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#111;margin:18px;max-width:760px}
    .warning{border:4px double #111;padding:12px;text-align:center;font-weight:900;margin:12px 0}
    .warning strong{display:block;font-size:21px}
    .warning span{display:block;font-size:13px;margin-top:5px}
    h1{font-size:18px;margin:12px 0 6px}
    p{margin:4px 0}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #aaa;padding:7px;text-align:left}
    .total{text-align:right;font-size:18px;font-weight:bold;margin-top:16px}
    .footer{margin-top:22px}
  </style>
</head>
<body>
  <div class="warning">
    <strong>RECIBO INTERNO — SEM VALIDADE FISCAL</strong>
    <span>NÃO É NFC-e / NÃO É DOCUMENTO AUTORIZADO PELA SEFAZ</span>
  </div>
  <h1>${escapeHtml(companyName)}</h1>
  ${company?.cnpj ? `<p>CNPJ cadastrado: ${escapeHtml(company.cnpj)}</p>` : ''}
  <p>Filial: ${escapeHtml(input.branchName)}</p>
  <p>Venda interna: ${escapeHtml(sale.id)}</p>
  <p>Operador: ${escapeHtml(sale.sellerNameSnapshot)}</p>
  <p>Data da venda: ${escapeHtml(sale.soldAt.toISOString())}</p>
  <p>Forma de pagamento: ${escapeHtml(sale.paymentMethod)}</p>
  ${sale.paymentMachineNameSnapshot ? `<p>Maquininha: ${escapeHtml(sale.paymentMachineNameSnapshot)}</p>` : ''}
  <p>Via de impressão: ${input.printNumber}</p>
  <table>
    <thead><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p>Subtotal: ${formatCurrency(sale.subtotalCents)}</p>
  <p>Desconto: ${formatCurrency(sale.discountCents)}</p>
  <p class="total">Total: ${formatCurrency(sale.totalCents)}</p>
  <p>Valor pago: ${formatCurrency(sale.paidCents ?? sale.totalCents)}</p>
  <p>Troco: ${formatCurrency(sale.changeCents)}</p>
  <div class="warning footer">
    <strong>RECIBO INTERNO — SEM VALIDADE FISCAL</strong>
    <span>NÃO É NFC-e / NÃO É DOCUMENTO AUTORIZADO PELA SEFAZ</span>
  </div>
</body>
</html>`;
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(value: number) {
  return (Number(value || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
