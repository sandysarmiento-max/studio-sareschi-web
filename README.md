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

## Invitación de clientas Aral Calc (redirect fijo)

Se agregó un endpoint seguro en `POST /api/aral-calc-invite` para invitar clientas con `redirectTo` explícito hacia:

- `https://studio-sareschi.com/acceso/nueva-contrasena/`

Así el enlace de invitación no cae en home y llega directo al flujo de crear contraseña.

### Variable secreta adicional

- `INVITE_ADMIN_TOKEN` (token secreto para autorizar quién puede llamar el endpoint)

### Uso paso a paso

1. Configurar en Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INVITE_ADMIN_TOKEN`
2. Hacer request `POST` al endpoint con header Bearer:

```bash
curl -X POST 'https://studio-sareschi.com/api/aral-calc-invite' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TU_INVITE_ADMIN_TOKEN' \
  -d '{"email":"clienta@correo.com"}'
```

3. Verificar respuesta `ok: true` y revisar que el correo de invitación llegue a la clienta.
4. La clienta abre el enlace del email y debe aterrizar en `/acceso/nueva-contrasena/`.
5. Define contraseña, luego puede iniciar sesión desde `/acceso/` y entrar a `/aral-calc/`.

### Prueba recomendada antes de merge

1. Invitar un correo real de prueba (idealmente uno nuevo, sin usuario previo en Auth).
2. Confirmar en la bandeja de entrada que el botón/enlace abre:
   - `https://studio-sareschi.com/acceso/nueva-contrasena/` (o URL con query/hash de Supabase, pero misma ruta base)
3. Completar nueva contraseña.
4. Probar login normal en `/acceso/`.
5. Confirmar acceso a `/aral-calc/`.

Notas:
- No habilita registro libre (solo invita quien conoce el token secreto).
- No modifica los flujos actuales de login ni recuperación.
