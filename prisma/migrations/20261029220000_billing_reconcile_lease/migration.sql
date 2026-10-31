-- A shared, expiring lease avoids simultaneous recurring reconciliation runs.
CREATE TABLE "billing_reconciliation_lease" (
  "key" TEXT PRIMARY KEY,
  "token" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL
);
ALTER TABLE "billing_reconciliation_lease" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "billing_reconciliation_lease" FROM PUBLIC;
