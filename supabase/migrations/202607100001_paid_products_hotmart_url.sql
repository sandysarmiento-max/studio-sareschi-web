alter table public.paid_products
add column if not exists hotmart_url text not null default '';

alter table public.paid_products
add column if not exists price_yape_pe numeric(10,2) not null default 0;

alter table public.paid_products
add column if not exists price_paypal_usd numeric(10,2) not null default 0;

-- Conserva como punto de partida los precios directos que antes estaban
-- registrados en los campos de Canva. Los campos antiguos no se eliminan.
update public.paid_products
set
  price_yape_pe = case
    when price_yape_pe = 0 then coalesce(price_canva_pe, 0)
    else price_yape_pe
  end,
  price_paypal_usd = case
    when price_paypal_usd = 0 then coalesce(price_canva_int, 0)
    else price_paypal_usd
  end;

comment on column public.paid_products.hotmart_url is
  'Enlace directo de pago en Hotmart para este producto.';

comment on column public.paid_products.price_yape_pe is
  'Precio de compra directa por WhatsApp con Yape, expresado en soles.';

comment on column public.paid_products.price_paypal_usd is
  'Precio de compra directa por WhatsApp con PayPal, expresado en dólares.';