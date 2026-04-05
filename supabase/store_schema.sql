-- Studio Sareschi PDF Store - Minimal schema
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create type public.product_variant_type as enum ('pdf_hq', 'canva_editable');
create type public.purchase_status as enum ('pending', 'paid', 'cancelled', 'refunded');

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_type public.product_variant_type not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'PEN',
  checkout_url text,
  download_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, variant_type)
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants(id),
  buyer_email text not null,
  payment_provider text,
  payment_reference text,
  status public.purchase_status not null default 'pending',
  purchased_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_free_offers (
  id uuid primary key default gen_random_uuid(),
  offer_date date not null unique,
  product_variant_id uuid not null references public.product_variants(id),
  created_at timestamptz not null default now()
);

create table if not exists public.free_download_claims (
  id uuid primary key default gen_random_uuid(),
  offer_date date not null,
  offer_id uuid not null references public.daily_free_offers(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (offer_date, email)
);

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.daily_free_offers enable row level security;
alter table public.free_download_claims enable row level security;
alter table public.purchases enable row level security;

create policy "public_read_products" on public.products
for select to anon, authenticated
using (is_active = true);

create policy "public_read_variants" on public.product_variants
for select to anon, authenticated
using (is_active = true);

create policy "public_read_daily_offer" on public.daily_free_offers
for select to anon, authenticated
using (true);

-- Keep claims and purchases private; only function/service role should write.

create or replace function public.claim_daily_free_download(p_email text, p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_offer public.daily_free_offers%rowtype;
  v_download_url text;
begin
  v_email := lower(trim(p_email));

  if v_email is null or v_email = '' then
    return jsonb_build_object('allowed', false, 'message', 'Correo inválido.');
  end if;

  select * into v_offer
  from public.daily_free_offers
  where id = p_offer_id
    and offer_date = current_date;

  if not found then
    return jsonb_build_object('allowed', false, 'message', 'La oferta gratuita de hoy no está disponible.');
  end if;

  begin
    insert into public.free_download_claims (offer_date, offer_id, email)
    values (v_offer.offer_date, v_offer.id, v_email);
  exception
    when unique_violation then
      return jsonb_build_object('allowed', false, 'message', 'Ya usaste tu descarga gratuita de hoy.');
  end;

  select download_url
    into v_download_url
  from public.product_variants
  where id = v_offer.product_variant_id;

  return jsonb_build_object(
    'allowed', true,
    'message', 'Descarga habilitada.',
    'download_url', v_download_url
  );
end;
$$;

revoke all on function public.claim_daily_free_download(text, uuid) from public;
grant execute on function public.claim_daily_free_download(text, uuid) to anon, authenticated;

-- Seed example (optional)
-- insert into public.products (slug, name, description, display_order)
-- values ('agenda-minimal', 'Agenda Minimal', 'Plantilla limpia para organizar tu semana.', 1);
