-- Read-only diagnostic. Reconciliation requires explicit human fiscal approval.
SELECT "document_id", ("request_payload"->>'printNumber')::INTEGER AS "print_number",
       COUNT(*) AS "copies", ARRAY_AGG("id" ORDER BY "created_at") AS "event_ids"
  FROM "fiscal_document_events"
 WHERE "event_type" IN ('internal_receipt_printed', 'internal_receipt_reprinted')
   AND "request_payload"->>'printNumber' ~ '^[1-9][0-9]*$'
 GROUP BY "document_id", ("request_payload"->>'printNumber')::INTEGER
HAVING COUNT(*) > 1 ORDER BY "document_id", "print_number";
