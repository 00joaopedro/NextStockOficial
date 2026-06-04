-- Defense in depth for direct Supabase API access.
-- Prisma/Postgres query scoping remains the primary application boundary.

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'profiles', 'tenants', 'branches', 'tenant_members', 'products',
    'product_images', 'payment_machines', 'pet_clients', 'pets',
    'pet_photos', 'agenda_pets', 'user_usage_events', 'resource_usage_snapshots'
  ]
  LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = target_table
          AND policyname = 'service_role_full_access'
      ) THEN
        EXECUTE format(
          'CREATE POLICY service_role_full_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
          target_table
        );
      END IF;
    END IF;
  END LOOP;
END $$;
