alter table public.paid_products
add column if not exists flipbook_url text;

comment on column public.paid_products.flipbook_url is
  'Enlace opcional para hojear una muestra. Admite /hojear/?agenda=..., HTTPS de Studio Sareschi o una URL externa HTTPS.';
