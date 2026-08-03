import { readFileSync } from 'fs';
import { join } from 'path';

describe('RC-012 receipt print numbering migration', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '..',
      'prisma',
      'migrations',
      '20260803000000_receipt_print_numbering',
      'migration.sql',
    ),
    'utf8',
  );

  it('backfills the counter from MAX of normalized historical numbers', () => {
    expect(sql).toContain('MAX("print_number")');
    expect(sql).toContain('"print_counter" = historical.maximum');
    expect(sql).not.toMatch(/COUNT\s*\(.*print/i);
  });
  it('stops clearly on duplicates without deleting or renumbering events', () => {
    expect(sql).toContain(
      'RC-012 preflight: duplicate historical receipt print number',
    );
    expect(sql).toContain("ERRCODE = '23505'");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"fiscal_document_events"/i);
  });
  it('adds database uniqueness, positivity, and an exact active receipt conflict target', () => {
    expect(sql).toContain(
      'fiscal_document_events_document_id_print_number_key',
    );
    expect(sql).toContain('sale_documents_print_counter_nonnegative_check');
    expect(sql).toContain('sale_documents_active_receipt_sale_key');
    expect(sql).toContain(`WHERE "type" = 'receipt' AND "deleted_at" IS NULL`);
  });
});
