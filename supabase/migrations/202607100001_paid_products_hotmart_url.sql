alter table public.paid_products
add column if not exists hotmart_url text not null default '';

comment on column public.paid_products.hotmart_url is
  'Enlace directo de pago en Hotmart para este producto.';
