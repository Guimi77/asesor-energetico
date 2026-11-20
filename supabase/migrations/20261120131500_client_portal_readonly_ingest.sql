-- SECURITY: public portal customers may read only their assigned energy records.
-- The existing helper previously returned TRUE for assigned client CUPS, allowing
-- authenticated customer sessions to call privileged historical invoice ingestion
-- RPCs (upsert_xtra_energy_history, _v2, _v3 and enrichment).
-- Keep the existing function signature and EXECUTE privileges so staff/admin
-- imports keep working, but remove the client writer privilege centrally.
-- No energy data, invoices, audit entries or client assignments are changed.
create or replace function private.can_ingest_energy_history_cups(p_cups text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'auth'
as $function$
  select coalesce(private.is_internal_user(), false);
$function$;

comment on function private.can_ingest_energy_history_cups(text) is
  'Internal staff/admin only. Customer portal is read-only; assigned clients cannot ingest or enrich invoices via SECURITY DEFINER RPCs.';
