-- Fail the migration if conflicting pending operations already exist; operators
-- must reconcile them instead of deleting financial history automatically.
CREATE UNIQUE INDEX "billing_one_pending_subscription_mutation"
ON "billing_subscription_operations" ("tenant_id", "subscription_id")
WHERE ("operation" LIKE 'PLAN_CHANGE:%' OR "operation" LIKE 'CANCEL%')
  AND "state" IN ('CLAIMED', 'PROCESSING', 'UNKNOWN');
