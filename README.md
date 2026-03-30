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

## Base de integración Supabase para Next.js

Se dejó preparada una estructura compatible con Next.js App Router y `@supabase/ssr`:

- Cliente de navegador: `src/lib/supabase/client.js`
- Cliente de servidor (SSR + cookies): `src/lib/supabase/server.js`
- Middleware para refresco de sesión y protección base de rutas: `middleware.js` + `src/lib/supabase/middleware.js`
- Helper para proteger páginas server-side: `src/lib/auth/require-user.js`
- Variables necesarias en Vercel/local: `.env.example`

### Variables de entorno requeridas

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

> No se usa `service_role` en frontend ni en esta base SSR.

### Dependencias necesarias

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Si vas a correrlo como app Next.js completa también necesitas `next`, `react`, `react-dom`.

## Uso local

Abrir `index.html` en el navegador.
