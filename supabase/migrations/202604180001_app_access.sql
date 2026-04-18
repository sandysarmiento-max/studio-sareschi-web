create extension if not exists pgcrypto;

create table if not exists public.app_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_key text not null,
  status text not null default 'active',
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_access_user_app_unique unique (user_id, app_key),
  constraint app_access_app_key_not_empty check (length(trim(app_key)) > 0),
  constraint app_access_status_allowed check (status in ('active', 'inactive'))
);

create index if not exists idx_app_access_user_status
  on public.app_access (user_id, app_key, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_access_updated_at on public.app_access;
create trigger trg_app_access_updated_at
before update on public.app_access
for each row
execute function public.set_updated_at();

alter table public.app_access enable row level security;

drop policy if exists app_access_read_own on public.app_access;

create policy app_access_read_own
on public.app_access
for select
to authenticated
using (auth.uid() = user_id);

comment on table public.app_access is
'Acceso por app para usuarios de auth. Escrituras reservadas a service role/backend o SQL manual por administracion.';
