-- The holder editor exposes the existing private client alias. This wrapper
-- keeps profile, alias and optional portfolio writes in one transaction while
-- preserving the older RPCs for clients that have not loaded the new UI yet.
create or replace function public.admin_update_holder_profile_with_alias(
  p_holder_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_email text,
  p_phone text,
  p_bank_account text,
  p_client_alias text,
  p_expected_client_alias text,
  p_expected_client_id uuid,
  p_portfolio_action text default 'keep',
  p_group_id uuid default null,
  p_new_name text default null,
  p_new_alias text default null,
  p_expected_portfolio_snapshot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_old_alias text;
  v_new_alias text := nullif(btrim(coalesce(p_client_alias, '')), '');
  v_expected_alias text := nullif(btrim(coalesce(p_expected_client_alias, '')), '');
  v_current_alias text;
  v_profile jsonb;
  v_changed boolean := false;
  v_written integer;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles
    where id = v_actor and role = 'admin' and active is true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  -- Resolve ownership by UUID and reject stale editors after reassignment.
  select h.client_id into v_client_id
  from public.holders h where h.id = p_holder_id for update nowait;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'holder_not_found');
  end if;
  if v_client_id is distinct from p_expected_client_id then
    return jsonb_build_object('ok', false, 'reason', 'holder_client_changed');
  end if;

  -- Serialize edits through different holders of the same legal client. A
  -- NO KEY UPDATE lock still permits the FK check of the legacy alias setter;
  -- FOR UPDATE could deadlock with its concurrent first alias insertion.
  perform 1 from public.clients where id = v_client_id for no key update nowait;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'holder_client_changed');
  end if;
  select nullif(btrim(coalesce(a.alias, '')), '') into v_old_alias
  from private.client_aliases a where a.client_id = v_client_id for update nowait;

  -- An exact retry may already have the destination value. A third value
  -- belongs to another edit and must never be silently overwritten.
  if v_old_alias is distinct from v_expected_alias
     and v_old_alias is distinct from v_new_alias then
    return jsonb_build_object('ok', false, 'reason', 'client_alias_conflict');
  end if;

  -- Reuse all fiscal identity, contact, portfolio snapshot and locking rules.
  v_profile := public.admin_update_holder_profile_with_portfolio(
    p_holder_id, p_legal_name, p_tax_id, p_email, p_phone, p_bank_account,
    p_portfolio_action, p_group_id, p_new_name, p_new_alias,
    p_expected_portfolio_snapshot
  );
  if coalesce((v_profile->>'ok')::boolean, false) is not true then
    return v_profile;
  end if;

  if v_old_alias is distinct from v_new_alias then
    if v_new_alias is null then
      delete from private.client_aliases where client_id = v_client_id;
      get diagnostics v_written = row_count;
    else
      insert into private.client_aliases(client_id, alias, updated_at, updated_by)
      values(v_client_id, v_new_alias, now(), v_actor)
      on conflict(client_id) do update
      set alias = excluded.alias, updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      where nullif(btrim(coalesce(private.client_aliases.alias, '')), '')
        is not distinct from v_old_alias;
      get diagnostics v_written = row_count;
      if v_written = 0 then
        -- A legacy writer can insert an initially absent alias between the
        -- preview and this statement. ON CONFLICT locks that row; validate it
        -- again, rolling back the preceding profile/group write on conflict.
        select nullif(btrim(coalesce(a.alias, '')), '') into v_current_alias
        from private.client_aliases a where a.client_id = v_client_id;
        if v_current_alias is distinct from v_new_alias then
          raise exception 'client_alias_conflict' using errcode = 'PAA01';
        end if;
      end if;
    end if;
    v_changed := v_written > 0;
  end if;

  if v_changed then
    insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
    values(v_actor, 'client_alias_updated_from_holder', 'client', v_client_id,
      jsonb_build_object(
        'source', 'holder_profile_editor', 'holder_id', p_holder_id,
        'client_id', v_client_id, 'had_alias', v_old_alias is not null,
        'has_alias', v_new_alias is not null
      ));
  end if;

  return v_profile || jsonb_build_object(
    'client_id', v_client_id, 'client_alias', coalesce(v_new_alias, ''),
    'alias_changed', v_changed
  );
exception
  when lock_not_available then
    return jsonb_build_object('ok', false, 'reason', 'holder_profile_busy');
  when sqlstate 'PAA01' then
    return jsonb_build_object('ok', false, 'reason', 'client_alias_conflict');
end;
$function$;

revoke all on function public.admin_update_holder_profile_with_alias(
  uuid,text,text,text,text,text,text,text,uuid,text,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.admin_update_holder_profile_with_alias(
  uuid,text,text,text,text,text,text,text,uuid,text,uuid,text,text,text
) to authenticated;
