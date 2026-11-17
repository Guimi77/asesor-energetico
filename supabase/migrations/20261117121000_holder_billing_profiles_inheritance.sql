
create table if not exists private.holder_contact_details (
  holder_id uuid primary key references public.holders(id) on delete cascade,
  email text,
  phone text,
  bank_account text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint holder_contact_email_len check (email is null or char_length(email) <= 320),
  constraint holder_contact_phone_len check (phone is null or char_length(phone) <= 64),
  constraint holder_contact_bank_len check (bank_account is null or char_length(bank_account) <= 64)
);

create table if not exists private.supply_contact_overrides (
  supply_id uuid primary key references public.supplies(id) on delete cascade,
  email text,
  phone text,
  bank_account text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint supply_contact_email_len check (email is null or char_length(email) <= 320),
  constraint supply_contact_phone_len check (phone is null or char_length(phone) <= 64),
  constraint supply_contact_bank_len check (bank_account is null or char_length(bank_account) <= 64)
);

alter table private.holder_contact_details enable row level security;
alter table private.supply_contact_overrides enable row level security;

revoke all on private.holder_contact_details from public, anon, authenticated;
revoke all on private.supply_contact_overrides from public, anon, authenticated;

insert into private.holder_contact_details(holder_id,email,phone,bank_account,updated_at,updated_by)
select h.id,d.email,d.phone,d.bank_account,d.updated_at,d.updated_by
from private.client_contact_details d
join public.holders h on h.client_id=d.client_id and h.status='active'
where (
  select count(*)
  from public.holders hx
  where hx.client_id=d.client_id and hx.status='active'
)=1
on conflict (holder_id) do nothing;

create or replace function public.get_internal_billing_profiles()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_holders jsonb := '{}'::jsonb;
  v_supplies jsonb := '{}'::jsonb;
  v_legacy_clients jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not private.is_internal_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_object_agg(
      d.holder_id::text,
      jsonb_build_object('email', d.email, 'phone', d.phone, 'bank_account', d.bank_account)
    ),
    '{}'::jsonb
  )
  into v_holders
  from private.holder_contact_details d;

  select coalesce(
    jsonb_object_agg(
      d.supply_id::text,
      jsonb_build_object('email', d.email, 'phone', d.phone, 'bank_account', d.bank_account)
    ),
    '{}'::jsonb
  )
  into v_supplies
  from private.supply_contact_overrides d;

  select coalesce(
    jsonb_object_agg(
      d.client_id::text,
      jsonb_build_object('email', d.email, 'phone', d.phone, 'bank_account', d.bank_account)
    ),
    '{}'::jsonb
  )
  into v_legacy_clients
  from private.client_contact_details d;

  return jsonb_build_object(
    'holders', v_holders,
    'supplies', v_supplies,
    'legacy_clients', v_legacy_clients
  );
end;
$function$;

revoke all on function public.get_internal_billing_profiles() from public, anon, authenticated;
grant execute on function public.get_internal_billing_profiles() to authenticated;

create or replace function public.admin_update_holder_profile(
  p_holder_id uuid,
  p_legal_name text,
  p_tax_id text,
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
  v_user uuid := auth.uid();
  v_email text := nullif(trim(coalesce(p_email,'')), '');
  v_phone text := nullif(trim(coalesce(p_phone,'')), '');
  v_bank text := nullif(trim(coalesce(p_bank_account,'')), '');
  v_identity jsonb;
begin
  if v_user is null or not exists (
    select 1
    from public.profiles
    where id=v_user and role='admin' and active is true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'admin_required');
  end if;

  if v_email is not null and (
    char_length(v_email) > 320
    or position('@' in v_email) <= 1
    or v_email ~ '[[:space:]]'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;
  if v_phone is not null and char_length(v_phone) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;
  if v_bank is not null and char_length(v_bank) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_bank_account');
  end if;

  v_identity := public.admin_update_holder_identity(
    p_holder_id,
    p_legal_name,
    nullif(trim(coalesce(p_tax_id,'')), '')
  );

  if coalesce((v_identity->>'ok')::boolean,false) is not true then
    return v_identity;
  end if;

  if v_email is null and v_phone is null and v_bank is null then
    delete from private.holder_contact_details where holder_id=p_holder_id;
  else
    insert into private.holder_contact_details(
      holder_id,email,phone,bank_account,updated_at,updated_by
    )
    values (
      p_holder_id,v_email,v_phone,v_bank,now(),v_user
    )
    on conflict(holder_id) do update
    set email=excluded.email,
        phone=excluded.phone,
        bank_account=excluded.bank_account,
        updated_at=now(),
        updated_by=v_user;
  end if;

  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
  values (
    v_user,
    'holder_contact_details_updated',
    'holder',
    p_holder_id,
    jsonb_build_object(
      'has_email', v_email is not null,
      'has_phone', v_phone is not null,
      'has_bank_account', v_bank is not null,
      'source', 'holder_profile_editor'
    )
  );

  return v_identity || jsonb_build_object(
    'has_email', v_email is not null,
    'has_phone', v_phone is not null,
    'has_bank_account', v_bank is not null
  );
end;
$function$;

revoke all on function public.admin_update_holder_profile(uuid,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_update_holder_profile(uuid,text,text,text,text,text)
  to authenticated;

create or replace function public.set_internal_supply_contact_overrides(
  p_supply_id uuid,
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
  v_user uuid := auth.uid();
  v_email text := nullif(trim(coalesce(p_email,'')), '');
  v_phone text := nullif(trim(coalesce(p_phone,'')), '');
  v_bank text := nullif(trim(coalesce(p_bank_account,'')), '');
begin
  if v_user is null or not private.is_internal_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_supply_id is null or not exists (
    select 1 from public.supplies where id=p_supply_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'supply_not_found');
  end if;

  if v_email is not null and (
    char_length(v_email) > 320
    or position('@' in v_email) <= 1
    or v_email ~ '[[:space:]]'
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
    delete from private.supply_contact_overrides where supply_id=p_supply_id;
  else
    insert into private.supply_contact_overrides(
      supply_id,email,phone,bank_account,updated_at,updated_by
    )
    values (
      p_supply_id,v_email,v_phone,v_bank,now(),v_user
    )
    on conflict(supply_id) do update
    set email=excluded.email,
        phone=excluded.phone,
        bank_account=excluded.bank_account,
        updated_at=now(),
        updated_by=v_user;
  end if;

  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
  values (
    v_user,
    'supply_contact_overrides_updated',
    'supply',
    p_supply_id,
    jsonb_build_object(
      'has_email_override', v_email is not null,
      'has_phone_override', v_phone is not null,
      'has_bank_account_override', v_bank is not null,
      'source', 'supply_editor'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'supply_id', p_supply_id,
    'has_email_override', v_email is not null,
    'has_phone_override', v_phone is not null,
    'has_bank_account_override', v_bank is not null
  );
end;
$function$;

revoke all on function public.set_internal_supply_contact_overrides(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.set_internal_supply_contact_overrides(uuid,text,text,text)
  to authenticated;
