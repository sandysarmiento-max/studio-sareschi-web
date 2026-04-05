# studio-sareschi-web

Sitio web principal de Studio Sareschi para alojar apps y herramientas digitales.

## Estado actual de arquitectura

Este repositorio **no es un proyecto Next.js completo**: es una web estática servida desde `public/`.

- HTML/CSS/JS estático en `public/`.
- Configuración de despliegue en `vercel.json`.
- Integración mínima de Supabase mediante:
  - una página estática de tienda en `public/pdfs/index.html`
  - un endpoint serverless en `api/public-config.js` para exponer variables públicas de entorno

## Estructura relevante

- `public/index.html`: home principal
- `public/pdfs/index.html`: tienda de descargables conectada a Supabase
- `public/styles.css`: estilos globales (incluye estilos de tienda)
- `public/acceso/index.html`: redirección legacy hacia `/pdfs/`
- `api/public-config.js`: endpoint para leer `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `supabase/store_schema.sql`: esquema mínimo SQL para productos, variantes, compras y descarga gratuita diaria

## Variables de entorno en Vercel

Debes tener configuradas estas variables en el proyecto:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

> No uses `service_role` en frontend.

## Configuración manual en Supabase (paso a paso)

1. Abre **Supabase → SQL Editor**.
2. Ejecuta todo el archivo `supabase/store_schema.sql`.
3. Inserta productos y variantes (mínimo 1 variante por producto).
4. Crea una fila diaria en `daily_free_offers` con la variante gratuita del día.
5. Verifica que cada variante tenga:
   - `checkout_url` (para compra individual)
   - `download_url` (URL final de descarga)

## Modelo comercial implementado

- PDFs independientes de Aral Calc y Folia.
- 1 descarga gratuita al día (controlada por correo y fecha).
- Venta individual por producto/variante.
- Variantes soportadas:
  - `pdf_hq`
  - `canva_editable`

## Notas de escalabilidad

Si más adelante necesitas autenticación, webhooks de pago o biblioteca por cliente, la recomendación es migrar a un framework full-stack (por ejemplo Next.js) o mantener estático + backend separado (Edge Functions / API dedicada).

## Uso local

Puedes abrir archivos HTML directo para revisar layout, pero para probar `/api/public-config` conviene correr en un entorno tipo Vercel dev.
