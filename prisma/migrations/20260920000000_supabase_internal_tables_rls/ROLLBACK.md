# Rollback

This migration enables RLS, revokes table privileges from `anon` and `authenticated`,
and creates a `service_role` policy where that Supabase role exists. It does not
change owners, columns, or rows.

Run the following in the target database as the migration owner to remove the policy
and disable RLS. The final grants restore the broad pre-hardening Data API access
pattern used by the existing Supabase project migrations; do not run this rollback
unless reopening those tables to the Data API is intended.

```sql
DO $$
DECLARE
  table_name text;
  internal_tables text[] := ARRAY[
    '_prisma_migrations', 'dev_workspaces', 'billing_checkout_intents',
    'upload_quota_reservations', 'upload_quota_counters', 'user_provisionings',
    'user_provisioning_events', 'auth_email_claims', 'local_credentials',
    'password_reset_tokens', 'auth_identities', 'oauth_intents',
    'auth_migration_ledger'
  ];
BEGIN
  FOREACH table_name IN ARRAY internal_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
        table_name || '_service_role_all', table_name);
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated', table_name);
    END IF;
  END LOOP;
END
$$;
```

If pre-migration ACLs differed from this project's usual broad Data API defaults,
restore the captured pre-migration grants instead of the `GRANT ALL` statement.
