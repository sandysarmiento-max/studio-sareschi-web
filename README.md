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

## Catálogo administrable de PDFs de paga

Se agregó un gestor privado para productos de paga en `/admin/paid-products/`.

### Variables de entorno necesarias (Vercel)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS` (lista separada por comas con emails administradores, por ejemplo: `admin@dominio.com,otro@dominio.com`)
- Si `ADMIN_EMAILS` no está definido, el panel admin permite a cualquier usuario autenticado (mismo login de Aral Calc).

### Pasos manuales en Supabase

1. Ejecutar migraciones SQL (incluye tabla `paid_products`, trigger `updated_at` y bucket `paid-previews`).
2. Verificar que exista el bucket público `paid-previews`.
3. Confirmar que los usuarios admin estén en `ADMIN_EMAILS` o con `app_metadata.role = 'admin'`.

### Flujo

1. Entrar a `/admin/paid-products/`.
2. Iniciar sesión con un usuario admin de Supabase Auth.
3. Crear o editar productos.
4. Subir imagen principal y previews.
5. Guardar.
6. Revisar `/pdfs/` (solo muestra productos activos y ordenados por `sort_order`).
