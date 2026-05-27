-- NextStock - definitive fix for Supabase Auth "Database error creating new user"
-- Run this whole file in Supabase SQL Editor.
--
-- The old trigger on auth.users tries to create public.profiles before the
-- backend can create tenant/profile/branch consistently. That breaks
-- Supabase Auth admin.createUser with "Database error creating new user".
--
-- This script removes the trigger responsibility. It does not delete data.

BEGIN;

DROP TRIGGER IF EXISTS "on_auth_user_created" ON auth.users;
DROP TRIGGER IF EXISTS "on_auth_user_created_trigger" ON auth.users;
DROP TRIGGER IF EXISTS "handle_new_user" ON auth.users;

-- Keep the function name as a harmless no-op in case any old deployment or
-- dashboard reference still expects it to exist. It no longer writes profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

COMMIT;

-- Verification: this should return zero rows for auth.users triggers that call
-- handle_new_user/on_auth_user_created.
SELECT
  trigger_name,
  event_object_schema,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
ORDER BY trigger_name;

-- Verification: inspect public.profiles columns/defaults that the backend now
-- fills after Supabase Auth creates the user.
SELECT
  column_name,
  is_nullable,
  data_type,
  column_default,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;
