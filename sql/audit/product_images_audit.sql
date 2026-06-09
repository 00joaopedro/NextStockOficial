-- Product images audit for NextStock.
-- Safe diagnostics only: SELECT statements, no data changes.

-- 1. Recent products with image counts.
select
  p.id,
  p.name,
  p.tenant_id,
  p.branch_id,
  p.created_at,
  count(pi.id) as image_count
from public.products p
left join public.product_images pi on pi.product_id = p.id
group by p.id, p.name, p.tenant_id, p.branch_id, p.created_at
order by p.created_at desc
limit 100;

-- 2. Images without file_url and storage_path.
select
  pi.id,
  pi.product_id,
  p.name as product_name,
  pi.file_name,
  pi.file_url,
  pi.storage_path,
  pi.created_at
from public.product_images pi
join public.products p on p.id = pi.product_id
where coalesce(trim(pi.file_url), '') = ''
  and coalesce(trim(pi.storage_path), '') = ''
order by pi.created_at desc;

-- 3. Images that are effectively only a file_name.
select
  pi.id,
  pi.product_id,
  p.name as product_name,
  pi.file_name,
  pi.file_url,
  pi.storage_path
from public.product_images pi
join public.products p on p.id = pi.product_id
where coalesce(trim(pi.file_name), '') <> ''
  and coalesce(trim(pi.file_url), '') = ''
  and coalesce(trim(pi.storage_path), '') = '';

-- 4. Orphan product images.
select
  pi.*
from public.product_images pi
left join public.products p on p.id = pi.product_id
where p.id is null;

-- 5. Products without images.
select
  p.id,
  p.name,
  p.tenant_id,
  p.branch_id,
  p.created_at
from public.products p
left join public.product_images pi on pi.product_id = p.id
where pi.id is null
order by p.created_at desc;

-- 6. Products without branch_id.
select
  id,
  name,
  tenant_id,
  branch_id,
  created_at
from public.products
where branch_id is null
order by created_at desc;

-- 7. Invalid non-empty image URLs.
select
  pi.id,
  pi.product_id,
  p.name as product_name,
  pi.file_name,
  pi.file_url,
  pi.storage_path
from public.product_images pi
join public.products p on p.id = pi.product_id
where coalesce(trim(pi.file_url), '') <> ''
  and pi.file_url !~* '^https?://';

-- 8. Duplicate image file names by product.
select
  product_id,
  file_name,
  count(*) as total
from public.product_images
group by product_id, file_name
having count(*) > 1;

-- 9. Real products/product_images columns.
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('products', 'product_images')
order by table_name, ordinal_position;

-- 10. Product/ProductImage constraints.
select
  conrelid::regclass::text as table_name,
  conname,
  convalidated,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.products'::regclass, 'public.product_images'::regclass)
order by table_name, conname;

-- 11. Product-related objects in Supabase Storage.
select
  bucket_id,
  name,
  created_at,
  updated_at,
  metadata
from storage.objects
where bucket_id ilike '%product%'
   or name ilike '%/products/%'
   or name ilike '%produto%'
order by created_at desc
limit 200;
