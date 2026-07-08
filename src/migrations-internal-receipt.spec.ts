import { readFileSync } from 'fs';
import { join } from 'path';

describe('internal receipt status migrations', () => {
  const migration = (name: string) =>
    readFileSync(
      join(__dirname, '..', 'prisma', 'migrations', name, 'migration.sql'),
      'utf8',
    );

  it('adiciona o enum internal_issued sem usar o novo valor na mesma migration', () => {
    const sql = migration('20260701010000_internal_receipt_status');

    expect(sql).toContain(
      `ALTER TYPE "SaleDocumentStatus" ADD VALUE IF NOT EXISTS 'internal_issued'`,
    );
    expect(sql).not.toMatch(/UPDATE\s+"sale_documents"/i);
    expect(sql).not.toContain('"status" IN (\'internal_issued\'');
  });

  it('aplica o backfill de recibo interno somente na migration posterior', () => {
    const sql = migration('20260708000000_apply_internal_receipt_status');

    expect(sql).toContain(`SET "status" = 'internal_issued'`);
    expect(sql).toContain(`WHERE "type" = 'receipt'`);
    expect(sql).toContain(`AND "status" = 'authorized'`);
    expect(sql).toContain('sale_documents_internal_receipt_non_fiscal_check');
    expect(sql).not.toContain(`"type" = 'nfce65'`);
    expect(sql).not.toContain(`"type" = 'nfe55'`);
  });
});
