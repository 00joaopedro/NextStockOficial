-- RC-004: persist the provider ordering watermark and local CAS state.
-- Nullable provider timestamps are intentional: Mercado Pago snapshots can omit
-- date_last_updated, in which case the application uses its conservative FSM.
ALTER TABLE "subscriptions"
  ADD COLUMN "last_provider_event_at" TIMESTAMP(3),
  ADD COLUMN "last_payment_state" "BillingPaymentStatus";

ALTER TABLE "checkout_sessions"
  ADD COLUMN "last_provider_event_at" TIMESTAMP(3),
  ADD COLUMN "last_payment_state" "BillingPaymentStatus";

ALTER TABLE "billing_payments"
  ADD COLUMN "provider_occurred_at" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "billing_invoices"
  ADD COLUMN "last_provider_event_at" TIMESTAMP(3),
  ADD COLUMN "last_payment_state" "BillingPaymentStatus";

CREATE INDEX "billing_payments_provider_occurred_at_idx"
  ON "billing_payments"("provider", "gateway_payment_id", "provider_occurred_at");
