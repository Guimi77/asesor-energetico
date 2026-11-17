create table if not exists private.client_contact_details (
  client_id uuid primary key references public.clients(id) on delete cascade,
  email text,
  phone text,
  bank_account text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint client_contact_email_len check (email is null or char_length(email) <= 320),
  constraint client_contact_phone_len check (phone is null or char_length(phone) <= 64),
  constraint client_contact_bank_len check (bank_account is null or char_length(bank_account) <= 64)
);

revoke all on private.client_contact_details from public, anon, authenticated;

create or replace function public.get_internal_client_contacts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_contacts jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not private.is_internal_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_object_agg(
      d.client_id::text,
      jsonb_build_object('email', d.email, 'phone', d.phone, 'bank_account', d.bank_account)
    ),
    '{}'::jsonb
  )
  into v_contacts
  from private.client_contact_details d;

  return v_contacts;
end;
$function$;

revoke all on function public.get_internal_client_contacts() from public, anon, authenticated;
grant execute on function public.get_internal_client_contacts() to authenticated;

create or replace function public.set_internal_client_contacts(
  p_client_id uuid,
  p_email text,
  p_phone text,
  p_bank_account text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_bank text := nullif(trim(coalesce(p_bank_account, '')), '');
  v_exists boolean := false;
begin
  if auth.uid() is null or not private.is_internal_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_client_id is null then
    return jsonb_build_object('ok', false, 'reason', 'client_id_required');
  end if;

  select exists(select 1 from public.clients c where c.id = p_client_id) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', false, 'reason', 'client_not_found');
  end if;

  if v_email is not null and (
    char_length(v_email) > 320 or position('@' in v_email) <= 1 or v_email ~ '[[:space:]]'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;
  if v_phone is not null and char_length(v_phone) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;
  if v_bank is not null and char_length(v_bank) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_bank_account');
  end if;

  if v_email is null and v_phone is null and v_bank is null then
    delete from private.client_contact_details where client_id = p_client_id;
  else
    insert into private.client_contact_details(client_id,email,phone,bank_account,updated_at,updated_by)
    values (p_client_id,v_email,v_phone,v_bank,now(),auth.uid())
    on conflict (client_id) do update
    set email=excluded.email,
        phone=excluded.phone,
        bank_account=excluded.bank_account,
        updated_at=now(),
        updated_by=auth.uid();
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'client_contact_details_updated',
    'client',
    p_client_id,
    jsonb_build_object(
      'has_email', v_email is not null,
      'has_phone', v_phone is not null,
      'has_bank_account', v_bank is not null,
      'source', 'client_editor'
    )
  );

  return jsonb_build_object('ok', true, 'client_id', p_client_id);
end;
$function$;

revoke all on function public.set_internal_client_contacts(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.set_internal_client_contacts(uuid,text,text,text) to authenticated;
