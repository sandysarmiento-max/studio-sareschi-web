begin;

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'freebies-private',
  'freebies-private',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.free_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  category text,
  thumbnail text,
  storage_path text,
  legacy_public_url text,
  page_count integer not null default 1,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default timezone('utc', now()),
  constraint free_products_storage_or_legacy_ck
    check (storage_path is not null or legacy_public_url is not null)
);

create index if not exists free_products_active_sort_idx
  on public.free_products(is_active, sort_order, created_at);

create table if not exists public.free_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  free_product_id uuid not null references public.free_products(id) on delete restrict,
  download_date date not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists free_downloads_one_per_user_per_day_ux
  on public.free_downloads(user_id, download_date);

create index if not exists free_downloads_product_idx
  on public.free_downloads(free_product_id, created_at desc);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.free_products enable row level security;
alter table public.free_downloads enable row level security;
alter table public.profiles enable row level security;

-- Catálogo gratuito visible para anon/authenticated (sin revelar nombres internos).
drop policy if exists "free_products_read_active" on public.free_products;
create policy "free_products_read_active"
on public.free_products
for select
to anon, authenticated
using (is_active = true);

-- Cada usuaria ve solo su historial de descargas.
drop policy if exists "free_downloads_read_own" on public.free_downloads;
create policy "free_downloads_read_own"
on public.free_downloads
for select
to authenticated
using (auth.uid() = user_id);

-- Inserción de descargas solo para la propia usuaria.
drop policy if exists "free_downloads_insert_own" on public.free_downloads;
create policy "free_downloads_insert_own"
on public.free_downloads
for insert
to authenticated
with check (auth.uid() = user_id);

-- Perfil básico.
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

-- Storage bucket privado: las clientes no listan ni leen directo.
drop policy if exists "freebies_private_authenticated_upload" on storage.objects;
create policy "freebies_private_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'freebies-private');

drop policy if exists "freebies_private_authenticated_update" on storage.objects;
create policy "freebies_private_authenticated_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'freebies-private')
with check (bucket_id = 'freebies-private');

-- No policy de select para anon/authenticated: acceso solo vía signed URL backend.

commit;
