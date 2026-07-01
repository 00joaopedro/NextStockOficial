-- PostgreSQL requires newly added enum values to be committed before they are
-- referenced by indexes or data changes in a later migration.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'payment_pending';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'suspended';
