-- NextStock now creates profile/tenant/branch from the NestJS backend.
-- Supabase Auth triggers must not create public.profiles.

DROP TRIGGER IF EXISTS "on_auth_user_created" ON auth.users;
DROP TRIGGER IF EXISTS "on_auth_user_created_trigger" ON auth.users;
DROP TRIGGER IF EXISTS "handle_new_user" ON auth.users;

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
