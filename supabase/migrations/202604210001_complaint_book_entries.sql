create extension if not exists pgcrypto;

create table if not exists public.complaint_book_entries (
  id bigint generated always as identity primary key,
  entry_uuid uuid not null default gen_random_uuid(),
  correlative_number text generated always as ('LR-' || lpad(id::text, 7, '0')) stored,
  created_at timestamptz not null default now(),

  consumer_full_name text not null,
  consumer_address text not null,
  consumer_document text not null,
  consumer_phone text not null,
  consumer_email text not null,

  guardian_full_name text,
  guardian_address text,
  guardian_document text,
  guardian_phone text,

  item_type text not null check (item_type in ('producto', 'servicio')),
  item_description text not null,
  claimed_amount numeric(10, 2),

  claim_type text not null check (claim_type in ('reclamo', 'queja')),
  claim_detail text not null,
  consumer_request text not null,
  provider_actions text,

  signature_full_name text not null,
  acceptance boolean not null default false
);

comment on table public.complaint_book_entries is 'Registros del Libro de Reclamaciones Virtual de Studio Sareschi';
comment on column public.complaint_book_entries.provider_actions is 'Observaciones/acciones adoptadas por proveedor; puede quedar vacío al registrar.';

alter table public.complaint_book_entries enable row level security;

-- Inserciones solo por backend (service role).
create policy "complaint_book_no_public_read"
  on public.complaint_book_entries
  for select
  to anon, authenticated
  using (false);

create policy "complaint_book_no_public_write"
  on public.complaint_book_entries
  for insert
  to anon, authenticated
  with check (false);
