-- Forward-only rollout: disabling the feature flags is the safe rollback. Existing
-- Mercado Pago rows and payment history are intentionally preserved.
ALTER TYPE "PaymentProviderCode" ADD VALUE IF NOT EXISTS 'PAGARME';
ALTER TYPE "PaymentProviderCode" ADD VALUE IF NOT EXISTS 'STONE';

DO $$ BEGIN
  CREATE TYPE "PaymentTerminalIntegrationMode" AS ENUM ('MANUAL','REMOTE_API','LOCAL_SDK','TEF','UNAVAILABLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "payment_terminals"
  ADD COLUMN IF NOT EXISTS "integration_mode" "PaymentTerminalIntegrationMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "notes" TEXT;
