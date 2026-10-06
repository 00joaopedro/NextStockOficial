import { Injectable } from '@nestjs/common';
import { Prisma, SaleDocumentStatus, SaleDocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type InternalReceiptContext = { userId: string; tenantId: string; branchId: string };
export type InternalReceiptSale = {
  id: string; orderId: string | null; sellerNameSnapshot: string; paymentMethod: string;
  paymentMachineNameSnapshot: string | null; subtotalCents: number; discountCents: number;
  totalCents: number; paidCents: number | null; changeCents: number; soldAt: Date;
  items: Array<{ productNameSnapshot: string; quantity: number; unitPriceCents: number; totalPriceCents: number }>;
};

@Injectable()
export class InternalReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  async issueAndRender(input: { sale: InternalReceiptSale; context: InternalReceiptContext; origin: 'cash_register' | 'history' | 'order' | 'legacy' }) {
    const { sale, context } = input;
    const audit = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "sale_documents" ("id", "sale_id", "tenant_id", "branch_id", "order_id", "type", "status", "issued_at", "created_by_id", "updated_by_id", "created_at", "updated_at")
        SELECT gen_random_uuid(), "sales"."id", "sales"."tenant_id", "sales"."branch_id", "sales"."order_id", 'receipt', 'internal_issued', NOW(), ${context.userId}::uuid, ${context.userId}::uuid, NOW(), NOW()
        FROM "sales" WHERE "sales"."id" = ${sale.id}::uuid AND "sales"."tenant_id" = ${context.tenantId}::uuid AND "sales"."branch_id" = ${context.branchId}::uuid AND "sales"."deleted_at" IS NULL
        ON CONFLICT ("sale_id", "type") WHERE "type" = 'receipt' AND "deleted_at" IS NULL
        DO UPDATE SET "tenant_id" = EXCLUDED."tenant_id", "branch_id" = EXCLUDED."branch_id", "order_id" = EXCLUDED."order_id", "status" = 'internal_issued', "model" = NULL, "environment" = NULL, "number" = NULL, "series" = NULL, "access_key" = NULL, "protocol" = NULL, "provider" = NULL, "provider_ref" = NULL, "xml_path" = NULL, "pdf_path" = NULL, "updated_by_id" = EXCLUDED."updated_by_id", "updated_at" = NOW()
        WHERE ("sale_documents"."tenant_id" IS NULL AND "sale_documents"."branch_id" IS NULL) OR ("sale_documents"."tenant_id" = EXCLUDED."tenant_id" AND "sale_documents"."branch_id" = EXCLUDED."branch_id")`;
      const document = await tx.saleDocument.findFirst({ where: { saleId: sale.id, tenantId: context.tenantId, branchId: context.branchId, type: SaleDocumentType.receipt, deletedAt: null }, select: { id: true } });
      if (!document) throw new Error('Receipt allocation could not recover its scoped document.');
      const allocated = await tx.saleDocument.update({ where: { id: document.id, saleId: sale.id, tenantId: context.tenantId, branchId: context.branchId, type: SaleDocumentType.receipt, deletedAt: null }, data: { printCounter: { increment: 1 } }, select: { printCounter: true } });
      const printNumber = allocated.printCounter;
      const eventType = printNumber === 1 ? 'internal_receipt_printed' : 'internal_receipt_reprinted';
      await tx.fiscalDocumentEvent.create({ data: { documentId: document.id, eventType, status: SaleDocumentStatus.internal_issued, printNumber, requestPayload: { tenantId: context.tenantId, branchId: context.branchId, saleId: sale.id, origin: input.origin, printNumber } satisfies Prisma.InputJsonValue, createdById: context.userId } });
      return { documentId: document.id, eventType, printNumber };
    });
    const [company, branch] = await Promise.all([
      this.prisma.companyFiscalConfig.findUnique({ where: { tenantId_branchId: { tenantId: context.tenantId, branchId: context.branchId } }, select: { legalName: true, tradeName: true, cnpj: true, receiptPaperWidthMm: true } }),
      this.prisma.branch.findFirst({ where: { id: context.branchId, tenantId: context.tenantId, isActive: true }, select: { name: true } }),
    ]);
    const paperWidthMm = normalizePaperWidth(company?.receiptPaperWidthMm);
    return { ...audit, paperWidthMm, html: this.buildHtml({ sale, company, branchName: branch?.name || 'Filial', printNumber: audit.printNumber, paperWidthMm }) };
  }

  private buildHtml(input: { sale: InternalReceiptSale; company: { legalName: string; tradeName: string | null; cnpj: string; receiptPaperWidthMm?: number | null } | null; branchName: string; printNumber: number; paperWidthMm: 58 | 80 }) {
    const { sale, company } = input;
    const rows = sale.items.map((item) => `<tr><td>${escapeHtml(item.productNameSnapshot)}</td><td>${item.quantity}</td><td>${formatCurrency(item.unitPriceCents)}</td><td>${formatCurrency(item.totalPriceCents)}</td></tr>`).join('');
    const companyName = company?.tradeName || company?.legalName || 'Empresa não configurada';
    const width = `${input.paperWidthMm}mm`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo interno ${escapeHtml(sale.id)}</title><style>
@page{size:${width} auto;margin:0}*{box-sizing:border-box}html,body{width:${width};margin:0;padding:0;background:#fff;color:#111}body{font-family:"Arial Narrow",Arial,sans-serif;font-size:11px;line-height:1.25;padding:4mm 3mm}.receipt{width:100%;max-width:${width};overflow-wrap:anywhere}.warning{border:1px solid #111;padding:3mm 2mm;text-align:center;font-weight:900;margin:2mm 0}.warning strong{display:block;font-size:13px;line-height:1.15}.warning span{display:block;font-size:9px;margin-top:1.5mm}h1{font-size:15px;text-align:center;margin:2mm 0 1mm;overflow-wrap:anywhere}p{margin:1mm 0}.meta{text-align:center}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3mm}th,td{border-bottom:1px dashed #777;padding:1.5mm 0;text-align:left;vertical-align:top;overflow-wrap:anywhere}th:nth-child(1),td:nth-child(1){width:42%}th:nth-child(2),td:nth-child(2){width:13%;text-align:right}th:nth-child(3),td:nth-child(3){width:22%;text-align:right}th:nth-child(4),td:nth-child(4){width:23%;text-align:right}.totals{margin-top:3mm;border-top:1px solid #111;padding-top:2mm}.line{display:flex;justify-content:space-between;gap:2mm}.total{font-size:15px;font-weight:bold;margin-top:1.5mm}.footer{margin-top:4mm}@media print{body{padding:3mm 2mm}.warning{break-inside:avoid}tr{break-inside:avoid}}
</style></head><body><main class="receipt" data-paper-width-mm="${input.paperWidthMm}"><div class="warning"><strong>RECIBO INTERNO — SEM VALIDADE FISCAL</strong><span>NÃO É NFC-e / NÃO É DOCUMENTO AUTORIZADO PELA SEFAZ</span></div><h1>${escapeHtml(companyName)}</h1><section class="meta">${company?.cnpj ? `<p>CNPJ cadastrado: ${escapeHtml(company.cnpj)}</p>` : ''}<p>Filial: ${escapeHtml(input.branchName)}</p><p>Venda interna: ${escapeHtml(sale.id)}</p><p>Operador: ${escapeHtml(sale.sellerNameSnapshot)}</p><p>Data da venda: ${escapeHtml(sale.soldAt.toLocaleString('pt-BR'))}</p><p>Forma de pagamento: ${escapeHtml(sale.paymentMethod)}</p>${sale.paymentMachineNameSnapshot ? `<p>Maquininha: ${escapeHtml(sale.paymentMachineNameSnapshot)}</p>` : ''}<p>Via de impressão: ${input.printNumber}</p></section><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><section class="totals"><p class="line"><span>Subtotal</span><span>${formatCurrency(sale.subtotalCents)}</span></p><p class="line"><span>Desconto</span><span>${formatCurrency(sale.discountCents)}</span></p><p class="line total"><span>Total</span><span>${formatCurrency(sale.totalCents)}</span></p><p class="line"><span>Valor pago</span><span>${formatCurrency(sale.paidCents ?? sale.totalCents)}</span></p><p class="line"><span>Troco</span><span>${formatCurrency(sale.changeCents)}</span></p></section><div class="warning footer"><strong>RECIBO INTERNO — SEM VALIDADE FISCAL</strong><span>NÃO É NFC-e / NÃO É DOCUMENTO AUTORIZADO PELA SEFAZ</span></div></main></body></html>`;
  }
}

function normalizePaperWidth(value: number | null | undefined): 58 | 80 { return value === 58 ? 58 : 80; }
function escapeHtml(value: unknown) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function formatCurrency(value: number) { return (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
