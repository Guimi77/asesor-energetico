-- Public client registrations stay blocked until an administrator links them to a client.
-- Internal @electricabt.com accounts keep their role_for_email behavior.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_public_request boolean := coalesce(new.raw_user_meta_data->>'registration_source','') = 'public_request';
  v_role public.app_role := public.role_for_email(new.email);
  v_active boolean;
begin
  v_active := case
    when v_public_request and v_role = 'client'::public.app_role then false
    else true
  end;

  insert into public.profiles (id, role, display_name, active, email)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''),'@',1), 'Usuario'),
    v_active,
    new.email
  )
  on conflict (id) do update
  set role = excluded.role,
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      active = public.profiles.active,
      email = excluded.email;

  return new;
end;
$function$;
