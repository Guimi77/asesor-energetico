alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
begin
  insert into public.profiles (id, role, display_name, active, email)
  values (
    new.id,
    public.role_for_email(new.email),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''),'@',1), 'Usuario'),
    true,
    new.email
  )
  on conflict (id) do update
  set role = excluded.role,
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      active = true,
      email = excluded.email;
  return new;
end;
$function$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_profile_email();
