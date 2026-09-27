-- Comparator pricing classification is stored outside public.invoices on purpose.
-- This migration must not change invoice ingestion, historical values, or existing rows.

create table if not exists public.invoice_pricing_assessments (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  commercial_product text,
  pricing_model text not null,
  pricing_detection text not null,
  pricing_confidence numeric(5,4) not null,
  pricing_evidence jsonb not null default '[]'::jsonb,
  classifier_version text not null,
  assessed_at timestamptz not null default now(),
  assessed_by uuid references auth.users(id) on delete set null,
  constraint invoice_pricing_model_check
    check (pricing_model in ('fixed','indexed','hybrid','unknown')),
  constraint invoice_pricing_detection_check
    check (pricing_detection in ('explicit','inferred','manual','unknown')),
  constraint invoice_pricing_confidence_check
    check (pricing_confidence >= 0 and pricing_confidence <= 1),
  constraint invoice_pricing_evidence_array_check
    check (jsonb_typeof(pricing_evidence) = 'array')
);

comment on table public.invoice_pricing_assessments is
  'Internal one-to-one pricing classification enrichment for validated invoices. Kept separate from invoice ingestion to avoid regressions.';

alter table public.invoice_pricing_assessments enable row level security;

revoke all on table public.invoice_pricing_assessments from public, anon;
grant select, insert, update on table public.invoice_pricing_assessments to authenticated;
grant select, insert, update, delete on table public.invoice_pricing_assessments to service_role;

drop policy if exists invoice_pricing_internal_select on public.invoice_pricing_assessments;
create policy invoice_pricing_internal_select
  on public.invoice_pricing_assessments
  for select
  to authenticated
  using ((select private.is_internal_user()));

drop policy if exists invoice_pricing_internal_insert on public.invoice_pricing_assessments;
create policy invoice_pricing_internal_insert
  on public.invoice_pricing_assessments
  for insert
  to authenticated
  with check ((select private.is_internal_user()));

drop policy if exists invoice_pricing_internal_update on public.invoice_pricing_assessments;
create policy invoice_pricing_internal_update
  on public.invoice_pricing_assessments
  for update
  to authenticated
  using ((select private.is_internal_user()))
  with check ((select private.is_internal_user()));

create or replace function public.enrich_invoice_pricing_model(
  p_invoice_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'private', 'auth'
as $function$
declare
  v_model text := lower(trim(coalesce(p_payload->>'model','')));
  v_detection text := lower(trim(coalesce(p_payload->>'detection','')));
  v_confidence numeric;
  v_evidence jsonb := coalesce(p_payload->'evidence','[]'::jsonb);
  v_product text := nullif(trim(coalesce(p_payload->>'commercial_product','')), '');
  v_version text := nullif(trim(coalesce(p_payload->>'version','')), '');
begin
  if auth.uid() is null or not private.is_internal_user() then
    raise exception 'not_authorized';
  end if;

  if p_invoice_id is null or not exists(select 1 from public.invoices where id=p_invoice_id) then
    return jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  end if;

  if v_model not in ('fixed','indexed','hybrid','unknown') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pricing_model');
  end if;

  if v_detection not in ('explicit','inferred','manual','unknown') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pricing_detection');
  end if;

  begin
    v_confidence := nullif(p_payload->>'confidence','')::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pricing_confidence');
  end;

  if v_confidence is null or v_confidence < 0 or v_confidence > 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pricing_confidence');
  end if;

  if jsonb_typeof(v_evidence) <> 'array' or jsonb_array_length(v_evidence) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pricing_evidence');
  end if;

  if v_version is null or length(v_version) > 120 or length(coalesce(v_product,'')) > 250 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pricing_metadata');
  end if;

  insert into public.invoice_pricing_assessments (
    invoice_id,
    commercial_product,
    pricing_model,
    pricing_detection,
    pricing_confidence,
    pricing_evidence,
    classifier_version,
    assessed_at,
    assessed_by
  ) values (
    p_invoice_id,
    v_product,
    v_model,
    v_detection,
    v_confidence,
    v_evidence,
    v_version,
    now(),
    auth.uid()
  )
  on conflict (invoice_id) do update set
    commercial_product = excluded.commercial_product,
    pricing_model = excluded.pricing_model,
    pricing_detection = excluded.pricing_detection,
    pricing_confidence = excluded.pricing_confidence,
    pricing_evidence = excluded.pricing_evidence,
    classifier_version = excluded.classifier_version,
    assessed_at = excluded.assessed_at,
    assessed_by = excluded.assessed_by;

  return jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id,
    'pricing_model', v_model,
    'pricing_detection', v_detection,
    'pricing_confidence', v_confidence,
    'classifier_version', v_version
  );
end;
$function$;

revoke all on function public.enrich_invoice_pricing_model(uuid,jsonb) from public, anon;
grant execute on function public.enrich_invoice_pricing_model(uuid,jsonb) to authenticated;
