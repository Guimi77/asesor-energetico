-- Permanent supply deletion, explicitly invoked by an active administrator.
-- No existing data is deleted by this migration.
create or replace function public.admin_purge_supply_v1(
  p_supply_id uuid,
  p_execute boolean default false,
  p_confirm_cups text default null,
  p_expected_signature text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_admin boolean;
  v_supply public.supplies%rowtype;
  v_holder public.holders%rowtype;
  v_invoice_count integer;
  v_other_supply_count integer;
  v_incident_count integer;
  v_recommendation_count integer;
  v_event_count integer;
  v_review_count integer;
  v_detail_count integer;
  v_signature text;
  v_deleted_invoices integer := 0;
  v_holder_deleted boolean := false;
begin
  select exists(
    select 1 from public.profiles
    where id=auth.uid() and active=true and role::text='admin'
  ) into v_admin;
  if not v_admin then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if p_supply_id is null then
    return jsonb_build_object('ok',false,'reason','supply_required');
  end if;

  -- Lock the parent rows. A competing administrative deletion or reassignment
  -- cannot silently change the target while we are deleting it.
  select * into v_supply from public.supplies where id=p_supply_id for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','supply_not_found');
  end if;
  select * into v_holder from public.holders where id=v_supply.holder_id for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','holder_missing');
  end if;

  select count(*) into v_invoice_count from public.invoices where supply_id=p_supply_id;
  select count(*) into v_other_supply_count from public.supplies where holder_id=v_holder.id and id<>p_supply_id;
  select count(*) into v_incident_count from public.incidents where supply_id=p_supply_id;
  select count(*) into v_recommendation_count from public.recommendations where supply_id=p_supply_id;
  select count(*) into v_event_count from public.supply_events where supply_id=p_supply_id;
  select count(*) into v_review_count from private.history_change_reviews where supply_id=p_supply_id;
  select (
    (select count(*) from public.invoice_energy_periods e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_power_periods e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_maximeters e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_excesses e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_reactive e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_tax_lines e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_adjustments e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_distributor_rights e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_compensation_periods e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
    +(select count(*) from public.invoice_pricing_assessments e join public.invoices i on i.id=e.invoice_id where i.supply_id=p_supply_id)
  ) into v_detail_count;

  -- The signature invalidates stale previews (count or updated-at changes).
  v_signature := md5(concat_ws('|',v_supply.id,v_supply.holder_id,v_supply.cups_key,
    v_supply.updated_at,v_holder.updated_at,v_invoice_count,
    v_other_supply_count,v_incident_count,v_recommendation_count,v_event_count,
    v_review_count,v_detail_count,
    coalesce((select max(updated_at)::text from public.invoices where supply_id=p_supply_id),''),
    coalesce((select sum(total_eur)::text from public.invoices where supply_id=p_supply_id),'')
  ));

  if not p_execute then
    return jsonb_build_object(
      'ok',true,'mode','preview','supply_id',v_supply.id,
      'cups',v_supply.cups,'supply_name',coalesce(v_supply.supply_name,''),
      'holder',v_holder.legal_name,'holder_id',v_holder.id,
      'holder_will_be_deleted',v_other_supply_count=0,
      'invoice_count',v_invoice_count,'detail_count',v_detail_count,
      'incident_count',v_incident_count,'recommendation_count',v_recommendation_count,
      'event_count',v_event_count,'history_review_count',v_review_count,
      'other_holder_supplies',v_other_supply_count,'signature',v_signature
    );
  end if;

  if nullif(trim(coalesce(p_confirm_cups,'')),'') is distinct from v_supply.cups
     or coalesce(p_expected_signature,'')<>v_signature then
    return jsonb_build_object('ok',false,'reason','confirmation_or_preview_stale');
  end if;

  -- Existing links to invoices are restricted in private.history_change_reviews.
  delete from private.history_change_reviews where supply_id=p_supply_id;
  delete from public.incidents where supply_id=p_supply_id;
  delete from public.recommendations where supply_id=p_supply_id;
  delete from public.supply_events where supply_id=p_supply_id;
  -- All invoice subdetail tables have ON DELETE CASCADE.
  delete from public.invoices where supply_id=p_supply_id;
  get diagnostics v_deleted_invoices = row_count;
  if v_deleted_invoices<>v_invoice_count then
    raise exception 'invoice_count_changed_during_purge';
  end if;
  delete from public.supplies where id=p_supply_id;
  if v_other_supply_count=0 then
    -- Do not touch the client or any other holder.
    delete from public.holders where id=v_holder.id
      and not exists(select 1 from public.supplies where holder_id=v_holder.id);
    get diagnostics v_other_supply_count = row_count;
    v_holder_deleted := v_other_supply_count=1;
  end if;

  return jsonb_build_object('ok',true,'mode','deleted',
    'invoice_count',v_deleted_invoices,'holder_deleted',v_holder_deleted);
end;
$function$;
revoke all on function public.admin_purge_supply_v1(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.admin_purge_supply_v1(uuid,boolean,text,text) to authenticated;
