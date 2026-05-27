DROP TRIGGER IF EXISTS "on_auth_user_created" ON auth.users;
DROP TRIGGER IF EXISTS "on_auth_user_created_trigger" ON auth.users;
DROP TRIGGER IF EXISTS "handle_new_user" ON auth.users;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
