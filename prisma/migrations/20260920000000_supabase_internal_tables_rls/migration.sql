-- Protect internal tables from Supabase Data API roles.
-- Backend and migration connections retain their existing ownership/grants.
-- No FORCE ROW LEVEL SECURITY is used: table owners retain normal PostgreSQL behavior.
-- Rollback: run the paired ROLLBACK.md statements after reviewing the restored API grants.
DO $$
DECLARE
  table_name text;
  internal_tables text[] := ARRAY[
    '_prisma_migrations',
    'dev_workspaces',
    'billing_checkout_intents',
    'upload_quota_reservations',
    'upload_quota_counters',
    'user_provisionings',
    'user_provisioning_events',
    'auth_email_claims',
    'local_credentials',
    'password_reset_tokens',
    'auth_identities',
    'oauth_intents',
    'auth_migration_ledger'
  ];
BEGIN
  FOREACH table_name IN ARRAY internal_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);

      -- Match the established service_role-only policy used by internal RLS tables.
      -- Supabase service_role bypasses RLS; the policy also supports its ordinary grants.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
          table_name || '_service_role_all', table_name);
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
