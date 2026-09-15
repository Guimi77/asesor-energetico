-- Missing per-period energy cost is not the same as a real zero cost.
-- Keep unknown values as NULL so reports cannot present 0.000000 €/kWh as if it came from the invoice.

alter table public.invoice_energy_periods
  alter column energy_cost_eur drop not null,
  alter column energy_cost_eur drop default;

do $migration$
declare
  r record;
  v_src text;
  v_old text := 'coalesce((v_item->>''energy_cost_eur'')::numeric,0)';
  v_new text := 'nullif(v_item->>''energy_cost_eur'','''')::numeric';
  v_count integer;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
      ('private','apply_fenie_completeness_batch'),
      ('public','enrich_xtra_invoice_completeness'),
      ('public','upsert_xtra_energy_history_legacy')
    )
  loop
    v_count := (length(r.prosrc) - length(replace(r.prosrc, v_old, ''))) / length(v_old);
    if v_count <> 1 then
      raise exception 'Expected exactly one missing-energy coercion in %.%, found %', r.nspname, r.proname, v_count;
    end if;
    v_src := replace(r.prosrc, v_old, v_new);
    execute format(
      'create or replace function %I.%I(%s) returns jsonb language plpgsql security definer set search_path to ''public'', ''private'', ''auth'' as %L',
      r.nspname, r.proname, r.args, v_src
    );
  end loop;
end;
$migration$;
