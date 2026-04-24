# AGENTS.md — Studio Sareschi

## Contexto del proyecto

Este repositorio corresponde a la web de Studio Sareschi en Vercel.

El sitio es principalmente estático. No asumir estructura Next.js con app/ o pages/ salvo que exista claramente en el repo.

Rutas importantes:
- public/index.html = página principal
- public/pdfs/index.html = tienda de PDFs
- public/acceso/index.html = login general y login por app
- public/acceso/nueva-contrasena/index.html = creación/recuperación de contraseña
- public/admin/aral-calc-invite/index.html = invitación Aral Calc
- public/admin/folia-invite/index.html = invitación Folia
- api/aral-calc-invite.js = backend invitación Aral Calc
- api/folia-invite.js = backend invitación Folia

## Reglas críticas

1. No habilitar registro libre.
2. No mezclar permisos de apps.
3. El acceso se controla con public.app_access:
   - app_key = 'aral_calc'
   - app_key = 'folia'
   - status = 'active'
4. Una usuaria con permiso de Aral Calc no debe entrar a Folia.
5. Una usuaria con permiso de Folia no debe entrar a Aral Calc.
6. Si se toca el flujo compartido de /acceso/ o /acceso/nueva-contrasena/, revisar ambos casos:
   - app=aral_calc
   - app=folia
7. No cambiar diseño general ni textos grandes salvo que la tarea lo pida.
8. No reconstruir flujos desde cero si ya funcionan.
9. Evitar tocar archivos no relacionados.

## Flujo esperado de invitación

### Aral Calc
- /admin/aral-calc-invite/ envía invitación.
- api/aral-calc-invite.js usa Supabase inviteUserByEmail.
- Debe crear o actualizar public.app_access con:
  - app_key = 'aral_calc'
  - status = 'active'
- El enlace debe llevar a crear contraseña con app=aral_calc.
- Después de crear contraseña, debe ir a /acceso/?app=aral_calc.

### Folia
- /admin/folia-invite/ envía invitación.
- api/folia-invite.js usa Supabase inviteUserByEmail.
- Debe crear o actualizar public.app_access con:
  - app_key = 'folia'
  - status = 'active'
- El enlace debe llevar a crear contraseña con app=folia.
- Después de crear contraseña, debe ir a /acceso/?app=folia.

## Forma correcta de trabajar

Antes de modificar:
- Revisar el estado actual del archivo.
- Comparar con el flujo que ya funciona.
- No asumir código anterior.

Después de modificar:
- Indicar archivos modificados.
- Indicar exactamente qué cambió.
- Ejecutar node --check en archivos JS modificados, si aplica.
- Mostrar:
  - git status --short
  - git diff --stat
  - git log -1 --oneline

## Regla importante sobre commits y PR

No decir “commit realizado” si el commit solo existe en el entorno interno.

Para considerar el trabajo terminado se debe confirmar una de estas opciones:

1. El commit está visible en GitHub/PR y se indica el hash real.
2. El PR fue creado o actualizado y se indica el enlace del PR.
3. Si no se pudo hacer push o actualizar el PR, decirlo claramente:
   “Los cambios quedaron solo en el entorno interno; no están en GitHub.”

En ese caso, entregar un patch/diff o instrucciones manuales exactas.

## Mensaje final esperado

Al terminar, responder siempre con:

- Archivos modificados
- Qué cambió
- Qué NO se tocó
- Pruebas ejecutadas
- Hash de commit visible en GitHub o aclaración de que no se pudo empujar
- Pasos para probar en preview
