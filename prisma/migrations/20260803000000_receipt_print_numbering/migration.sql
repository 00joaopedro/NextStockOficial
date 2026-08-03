-- RC-012: persist and atomically allocate internal receipt print numbers.
ALTER TABLE "sale_documents" ADD COLUMN "print_counter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "fiscal_document_events" ADD COLUMN "print_number" INTEGER;

-- Stop with an operationally useful error rather than silently renumbering the
-- append-only fiscal history. The companion audit query lists every collision.
DO $$
DECLARE duplicate RECORD;
BEGIN
  SELECT e."document_id", (e."request_payload"->>'printNumber')::INTEGER AS print_number,
         COUNT(*) AS copies
    INTO duplicate
    FROM "fiscal_document_events" e
   WHERE e."event_type" IN ('internal_receipt_printed', 'internal_receipt_reprinted')
     AND e."request_payload"->>'printNumber' ~ '^[1-9][0-9]*$'
   GROUP BY e."document_id", (e."request_payload"->>'printNumber')::INTEGER
  HAVING COUNT(*) > 1 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'RC-012 preflight: duplicate historical receipt print number (document_id=%s, print_number=%s, copies=%s). Run prisma/audit/rc-012-receipt-print-duplicates.sql; reconciliation requires explicit fiscal approval.',
      duplicate."document_id", duplicate.print_number, duplicate.copies), ERRCODE = '23505';
  END IF;
END $$;

-- Project the already-recorded payload value into the normalized column. This
-- does not delete, renumber, or otherwise rewrite the historical audit meaning.
UPDATE "fiscal_document_events"
   SET "print_number" = ("request_payload"->>'printNumber')::INTEGER
 WHERE "event_type" IN ('internal_receipt_printed', 'internal_receipt_reprinted')
   AND "request_payload"->>'printNumber' ~ '^[1-9][0-9]*$';

UPDATE "sale_documents" d SET "print_counter" = historical.maximum
  FROM (SELECT "document_id", MAX("print_number") AS maximum
          FROM "fiscal_document_events" WHERE "print_number" IS NOT NULL
         GROUP BY "document_id") historical
 WHERE d."id" = historical."document_id";

ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_print_counter_nonnegative_check"
  CHECK ("print_counter" >= 0);
ALTER TABLE "fiscal_document_events" ADD CONSTRAINT "fiscal_document_events_print_number_positive_check"
  CHECK ("print_number" IS NULL OR "print_number" > 0);
CREATE UNIQUE INDEX "fiscal_document_events_document_id_print_number_key"
  ON "fiscal_document_events"("document_id", "print_number");

-- The existing active-document index is restricted to NFe/NFCe. Receipts need
-- their own exact conflict target for concurrent find-or-create.
DO $$
DECLARE duplicate RECORD;
BEGIN
  SELECT "sale_id", COUNT(*) AS copies INTO duplicate FROM "sale_documents"
   WHERE "type" = 'receipt' AND "deleted_at" IS NULL
   GROUP BY "sale_id" HAVING COUNT(*) > 1 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'RC-012 preflight: duplicate active receipts (sale_id=%s, copies=%s). Explicit reconciliation is required.',
      duplicate."sale_id", duplicate.copies), ERRCODE = '23505';
  END IF;
END $$;
CREATE UNIQUE INDEX "sale_documents_active_receipt_sale_key"
  ON "sale_documents"("sale_id", "type")
  WHERE "type" = 'receipt' AND "deleted_at" IS NULL;
