-- NextStock - align public.branches with Prisma Branch model.
-- Run this whole file in Supabase SQL Editor if production is missing
-- branches.is_active or any other Branch column expected by Prisma.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE public.branches
SET
  id = COALESCE(id, gen_random_uuid()),
  name = COALESCE(NULLIF(name, ''), 'Matriz'),
  slug = COALESCE(NULLIF(slug, ''), 'matriz'),
  is_default = COALESCE(is_default, false),
  is_active = COALESCE(is_active, true),
  created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
  updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);

ALTER TABLE public.branches
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN slug SET NOT NULL,
  ALTER COLUMN is_default SET DEFAULT false,
  ALTER COLUMN is_default SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_pkey'
      AND conrelid = 'public.branches'::regclass
  ) THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_pkey PRIMARY KEY (id);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_id_slug_key
  ON public.branches(tenant_id, slug);

CREATE INDEX IF NOT EXISTS branches_tenant_id_idx
  ON public.branches(tenant_id);

CREATE INDEX IF NOT EXISTS branches_tenant_id_is_active_idx
  ON public.branches(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS branches_tenant_id_is_default_idx
  ON public.branches(tenant_id, is_default);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_tenant_id_fkey'
      AND conrelid = 'public.branches'::regclass
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END
$$;

SELECT
  column_name,
  is_nullable,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'branches'
ORDER BY ordinal_position;
