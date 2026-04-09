create extension if not exists pgcrypto;

create table if not exists public.paid_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null default '',
  price_pdf_pe numeric(10,2) not null default 0,
  price_pdf_int numeric(10,2) not null default 0,
  price_canva_pe numeric(10,2) not null default 0,
  price_canva_int numeric(10,2) not null default 0,
  main_image_url text not null default '',
  preview_01_url text not null default '',
  preview_02_url text not null default '',
  preview_03_url text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_products_code_format check (code ~ '^[a-z0-9-]+$')
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_paid_products_updated_at on public.paid_products;
create trigger trg_paid_products_updated_at
before update on public.paid_products
for each row
execute function public.set_updated_at();

alter table public.paid_products enable row level security;

create policy if not exists paid_products_public_read_active
on public.paid_products
for select
using (active = true);

insert into storage.buckets (id, name, public)
values ('paid-previews', 'paid-previews', true)
on conflict (id) do update set public = excluded.public;

create policy if not exists paid_previews_public_read
on storage.objects
for select
using (bucket_id = 'paid-previews');
