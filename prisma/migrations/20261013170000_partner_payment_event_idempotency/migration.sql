-- Prevents the same provider transition from creating duplicate partner-payment events.
CREATE UNIQUE INDEX "partner_referral_payment_events_ref_provider_key"
  ON "partner_referral_payment_events" ("referral_id", "provider_event_id");