-- Keep a single browser-facing history write entry point.
-- public.upsert_xtra_energy_history performs the client/internal authorization
-- and invokes this implementation function under SECURITY DEFINER ownership.
revoke all on function public.ingest_xtra_energy_history_safe(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_xtra_energy_history_safe(jsonb) to service_role;
