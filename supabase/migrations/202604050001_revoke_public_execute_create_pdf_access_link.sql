begin;

revoke execute on function public.create_pdf_access_link(text, uuid) from public, anon, authenticated;
grant execute on function public.create_pdf_access_link(text, uuid) to service_role, postgres;

commit;
