ALTER TABLE "promotion_reservations"
  ADD COLUMN "checkout_session_id" UUID;

CREATE UNIQUE INDEX "promotion_reservations_checkout_session_id_key"
  ON "promotion_reservations" ("checkout_session_id");

ALTER TABLE "promotion_reservations"
  ADD CONSTRAINT "promotion_reservations_checkout_session_id_fkey"
  FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
