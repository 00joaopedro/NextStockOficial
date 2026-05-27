-- NextStock - fix for Supabase Auth "Database error creating new user"
-- Run this whole file in Supabase SQL Editor.
--
-- Strategy:
-- 1. Make public.profiles defaults compatible with Auth user creation.
-- 2. Replace any legacy auth.users trigger with a safe trigger.
-- 3. The trigger creates/updates only a minimal profile and never raises.
-- 4. The NestJS backend remains authoritative and upserts the full profile,
--    tenant, branch and tenant_members after Supabase Auth succeeds.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'Comprador'::public."Role",
  ALTER COLUMN allowed_system_types SET DEFAULT ARRAY[]::public."SystemType"[],
  ALTER COLUMN is_super_admin SET DEFAULT false,
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.profiles
  ALTER COLUMN system_type SET DEFAULT 'padrao'::public."SystemType";

UPDATE public.profiles
SET
  email = COALESCE(NULLIF(email, ''), id::text || '@auth.local'),
  name = COALESCE(NULLIF(name, ''), split_part(COALESCE(NULLIF(email, ''), id::text), '@', 1), 'Usuario'),
  full_name = COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), split_part(COALESCE(NULLIF(email, ''), id::text), '@', 1), 'Usuario'),
  access_name_normalized = COALESCE(
    NULLIF(access_name_normalized, ''),
    lower(split_part(COALESCE(NULLIF(email, ''), id::text), '@', 1)) || '-' || left(id::text, 8)
  ),
  role = COALESCE(role, 'Comprador'::public."Role"),
  system_type = COALESCE(system_type, 'padrao'::public."SystemType"),
  allowed_system_types = CASE
    WHEN COALESCE(array_length(allowed_system_types, 1), 0) = 0
      THEN ARRAY[COALESCE(system_type, 'padrao'::public."SystemType")]
    ELSE allowed_system_types
  END,
  is_super_admin = COALESCE(is_super_admin, false),
  supabase_user_id = COALESCE(supabase_user_id, id),
  updated_at = now()
WHERE email IS NULL
   OR email = ''
   OR name IS NULL
   OR name = ''
   OR full_name IS NULL
   OR access_name_normalized IS NULL
   OR access_name_normalized = ''
   OR role IS NULL
   OR system_type IS NULL
   OR COALESCE(array_length(allowed_system_types, 1), 0) = 0
   OR is_super_admin IS NULL
   OR supabase_user_id IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  metadata jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  safe_email text := COALESCE(NULLIF(NEW.email, ''), NEW.id::text || '@auth.local');
  safe_name text := COALESCE(
    NULLIF(metadata->>'name', ''),
    NULLIF(metadata->>'full_name', ''),
    split_part(COALESCE(NULLIF(NEW.email, ''), NEW.id::text), '@', 1),
    'Usuario'
  );
  safe_full_name text := COALESCE(NULLIF(metadata->>'full_name', ''), safe_name);
  safe_system_type text := CASE
    WHEN metadata->>'systemType' IN ('padrao', 'petshop') THEN metadata->>'systemType'
    WHEN metadata->>'system_type' IN ('padrao', 'petshop') THEN metadata->>'system_type'
    ELSE 'padrao'
  END;
  safe_access_name text := lower(
    regexp_replace(
      COALESCE(NULLIF(metadata->>'access_name_normalized', ''), safe_name),
      '\s+',
      ' ',
      'g'
    )
  ) || '-' || left(NEW.id::text, 8);
BEGIN
  INSERT INTO public.profiles (
    id,
    supabase_user_id,
    email,
    name,
    full_name,
    access_name_normalized,
    role,
    system_type,
    allowed_system_types,
    is_super_admin,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.id,
    safe_email,
    safe_name,
    safe_full_name,
    safe_access_name,
    'Comprador'::public."Role",
    safe_system_type::public."SystemType",
    ARRAY[safe_system_type::public."SystemType"],
    false,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    supabase_user_id = COALESCE(public.profiles.supabase_user_id, EXCLUDED.supabase_user_id),
    email = COALESCE(NULLIF(public.profiles.email, ''), EXCLUDED.email),
    name = COALESCE(NULLIF(public.profiles.name, ''), EXCLUDED.name),
    full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
    access_name_normalized = COALESCE(
      NULLIF(public.profiles.access_name_normalized, ''),
      EXCLUDED.access_name_normalized
    ),
    role = COALESCE(public.profiles.role, EXCLUDED.role),
    system_type = COALESCE(public.profiles.system_type, EXCLUDED.system_type),
    allowed_system_types = CASE
      WHEN COALESCE(array_length(public.profiles.allowed_system_types, 1), 0) = 0
        THEN EXCLUDED.allowed_system_types
      ELSE public.profiles.allowed_system_types
    END,
    is_super_admin = COALESCE(public.profiles.is_super_admin, false),
    updated_at = now();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user skipped profile upsert for auth user %, error: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "on_auth_user_created" ON auth.users;
DROP TRIGGER IF EXISTS "on_auth_user_created_trigger" ON auth.users;
DROP TRIGGER IF EXISTS "handle_new_user" ON auth.users;

CREATE TRIGGER "on_auth_user_created"
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

SELECT
  trigger_name,
  event_object_schema,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
ORDER BY trigger_name;

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
