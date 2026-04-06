begin;

-- Endurece bucket privado: sin escrituras directas para usuarias autenticadas.
drop policy if exists "freebies_private_authenticated_upload" on storage.objects;
drop policy if exists "freebies_private_authenticated_update" on storage.objects;

-- No se crean nuevas policies de insert/update/delete para authenticated.
-- El alta/edición de archivos queda en flujos de confianza (service_role/backend).

commit;
