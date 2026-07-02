-- Defense in depth for tables that are accessed exclusively through NestJS/Prisma.
-- service_role remains the only PostgREST role allowed by policy.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'orders',
    'order_items',
    'employees',
    'suppliers',
    'expenses',
    'expense_items',
    'expense_files',
    'plans'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = table_name
          AND policyname = table_name || '_service_role_all'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
          table_name || '_service_role_all',
          table_name
        );
      END IF;
    END IF;
  END LOOP;
END
$$;
