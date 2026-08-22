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
      // The partial UNIQUE index is the exact arbiter. ON CONFLICT converges
      // every replica on one active receipt without aborting the transaction.
      await tx.$executeRaw`
        INSERT INTO "sale_documents" (
          "id", "sale_id", "tenant_id", "branch_id", "order_id", "type",
          "status", "issued_at", "created_by_id", "updated_by_id",
          "created_at", "updated_at"
        )
        SELECT gen_random_uuid(), "sales"."id", "sales"."tenant_id",
          "sales"."branch_id", "sales"."order_id", 'receipt',
          'internal_issued', NOW(), ${context.userId}::uuid,
          ${context.userId}::uuid, NOW(), NOW()
        FROM "sales"
        WHERE "sales"."id" = ${sale.id}::uuid
          AND "sales"."tenant_id" = ${context.tenantId}::uuid
          AND "sales"."branch_id" = ${context.branchId}::uuid
          AND "sales"."deleted_at" IS NULL
        ON CONFLICT ("sale_id", "type")
          WHERE "type" = 'receipt' AND "deleted_at" IS NULL
        DO UPDATE SET
          "tenant_id" = EXCLUDED."tenant_id", "branch_id" = EXCLUDED."branch_id",
          "order_id" = EXCLUDED."order_id", "status" = 'internal_issued',
          "model" = NULL, "environment" = NULL, "number" = NULL,
          "series" = NULL, "access_key" = NULL, "protocol" = NULL,
          "provider" = NULL, "provider_ref" = NULL, "xml_path" = NULL,
          "pdf_path" = NULL, "updated_by_id" = EXCLUDED."updated_by_id",
          "updated_at" = NOW()
        WHERE ("sale_documents"."tenant_id" IS NULL AND "sale_documents"."branch_id" IS NULL)
           OR ("sale_documents"."tenant_id" = EXCLUDED."tenant_id"
               AND "sale_documents"."branch_id" = EXCLUDED."branch_id")
      `;

      const document = await tx.saleDocument.findFirst({
        where: {
          saleId: sale.id,
          tenantId: context.tenantId,
          branchId: context.branchId,
          type: SaleDocumentType.receipt,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!document) {
        throw new Error(
          'Receipt allocation could not recover its scoped document.',
        );
      }

      // Prisma emits one UPDATE ... SET print_counter = print_counter + 1
      // ... RETURNING print_counter. There is no read/update race.
      const allocated = await tx.saleDocument.update({
        where: {
          id: document.id,
          saleId: sale.id,
          tenantId: context.tenantId,
          branchId: context.branchId,
          type: SaleDocumentType.receipt,
          deletedAt: null,
        },
        data: { printCounter: { increment: 1 } },
        select: { printCounter: true },
      });
      const printNumber = allocated.printCounter;
      const eventType =
        printNumber === 1
          ? 'internal_receipt_printed'
          : 'internal_receipt_reprinted';
      await tx.fiscalDocumentEvent.create({
        data: {
          documentId: document.id,
          eventType,
          status: SaleDocumentStatus.internal_issued,
          printNumber,
          requestPayload: {
            tenantId: context.tenantId,
            branchId: context.branchId,
            saleId: sale.id,
            origin: input.origin,
            printNumber,
          } satisfies Prisma.InputJsonValue,
          createdById: context.userId,
        },
      });
      return { documentId: document.id, eventType, printNumber };
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
