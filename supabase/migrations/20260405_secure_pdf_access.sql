-- Seguridad storefront PDF
-- 1) No exponer download_url en lecturas anónimas.
-- 2) Exponer solo metadata pública para catálogo.
-- 3) Entregar links firmados solo desde RPC de backend con service role.

create or replace view public.pdf_storefront_public as
select
  p.id,
  p.slug,
  p.title,
  p.subtitle,
  p.preview,
  p.prices,
  p.is_featured,
  p.badge,
  p.created_at,
  p.is_active
from public.pdf_products p
where p.is_active = true;

revoke all on public.pdf_storefront_public from public;
grant select on public.pdf_storefront_public to anon, authenticated;

-- Asegura que download_url no se filtre por select directo.
revoke select(download_url) on public.pdf_products from anon, authenticated;

create or replace function public.get_storefront_products_public()
returns setof public.pdf_storefront_public
language sql
security invoker
stable
as $$
  select *
  from public.pdf_storefront_public
  order by is_featured desc, created_at desc;
$$;

grant execute on function public.get_storefront_products_public() to anon, authenticated;

create or replace function public.get_daily_free_product_public()
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'description', coalesce(p.subtitle, ''),
    'slug', p.slug
  )
  from public.pdf_products p
  where p.is_active = true and p.is_daily_free = true
  order by p.updated_at desc
  limit 1;
$$;

grant execute on function public.get_daily_free_product_public() to anon, authenticated;

-- Ejecutar solo con service_role desde API protegida.
create or replace function public.create_pdf_access_link(p_action text, p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_download_path text;
  v_user_id uuid := auth.uid();
  v_allowed boolean := false;
begin
  -- Validación mínima; aquí se conecta con reglas de compra y daily free.
  if p_action = 'claim-daily-free' then
    v_allowed := public.can_claim_daily_free(v_user_id);
  elsif p_action in ('buy-pdf', 'buy-canva') then
    v_allowed := public.user_has_purchase(v_user_id, p_product_id, p_action);
  end if;

  if not v_allowed then
    raise exception 'not_authorized';
  end if;

  select download_path into v_download_path
  from public.pdf_products
  where id = p_product_id and is_active = true;

  if v_download_path is null then
    raise exception 'asset_not_found';
  end if;

  return public.storage_create_signed_link(v_download_path, 300);
end;
$$;

revoke all on function public.create_pdf_access_link(text, uuid) from anon, authenticated;
