# studio-sareschi-web

Sitio web principal de Studio Sareschi para alojar apps y herramientas digitales.

## Estructura ideal para V1 (sin backend)

Para este alcance inicial, la estructura recomendada es una landing estática con secciones claras y crecimiento progresivo:

- `index.html`: home + secciones Apps y Libre uso, junto con CTA de WhatsApp.
- `styles.css`: estilos visuales (paleta, tipografías, layout responsive, componentes).
- `assets/` (futuro): imágenes, íconos y branding.

## Alcance aplicado en esta V1

- Home simple y profesional.
- Sección Apps con:
  - Aral Calc
  - Folia
- Sección Libre uso con:
  - mini calculadora de anillo
- Botón flotante de contacto por WhatsApp.

## Fuera de alcance (no implementado)

- Usuarios
- Contraseñas
- Pagos automáticos
- Backend
- Base de datos

## Uso local

Abrir `index.html` en el navegador.

## Lanzamiento real Zona Gratuita (Supabase privado)

### Variables de entorno (Vercel + local)

Configura estas variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_FREEBIES_BUCKET=freebies-private`

### Pasos manuales en Supabase Dashboard

1. **Auth**
   - Ve a `Authentication > Providers > Email`.
   - Activa `Email` y habilita **Magic Link / OTP**.
   - En `URL Configuration`, agrega tu dominio de producción y local (`http://localhost:3000` o el que uses) en Redirect URLs.

2. **Storage**
   - Verifica que exista el bucket **privado** `freebies-private` (la migración también lo crea).
   - Sube tus 18 archivos PDF a rutas internas técnicas, por ejemplo:
     - `freebies/2026/fb_001.pdf`
     - `freebies/2026/fb_002.pdf`
     - ...
   - No los publiques y no compartas URL públicas directas.

3. **SQL migrations**
   - Ejecuta las migraciones en `supabase/migrations`.
   - Esto crea `free_products`, `free_downloads`, `profiles`, índices y RLS.

4. **Cargar catálogo visible**
   - Inserta 18 filas en `public.free_products` con tus títulos comerciales.
   - Campo recomendado:
     - `slug`: identificador URL/UI.
     - `title`: nombre bonito visible.
     - `storage_path`: ruta interna en bucket (`freebies/2026/fb_001.pdf`).
     - `legacy_public_url`: solo durante migración gradual desde `/public/freebies`.

### Migración progresiva desde `/public/freebies`

La Zona Gratuita ahora consulta `free_products` en Supabase y, al descargar:

1. valida sesión de usuaria,
2. valida límite de `1 descarga/día`,
3. registra en `free_downloads`,
4. genera signed URL temporal desde bucket privado.

Mientras migras, puedes conservar `legacy_public_url` por producto para evitar romper la web. Cuando todos estén en Storage privado, deja `legacy_public_url` en `NULL`.
