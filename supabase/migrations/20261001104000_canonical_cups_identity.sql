-- Canonical CUPS identity.
-- The optional two-character extension (commonly 0F) is not part of the
-- supply identity. Store/display the full value, but identify a supply by
-- the first 20 alphanumeric characters everywhere.

create or replace function public.canonical_cups_identity(p_cups text)
returns text
language sql
immutable
parallel safe
as $$
  with normalized as (
    select upper(regexp_replace(coalesce(p_cups,''), '[^A-Za-z0-9]', '', 'g')) as value
  )
  select case
    when left(value,2)='ES' and length(value)>=20 then left(value,20)
    else value
  end
  from normalized;
$$;

comment on function public.canonical_cups_identity(text) is
'Canonical electricity supply identity. Optional trailing CUPS extension characters such as 0F never differentiate supplies.';

do $$
begin
  if exists (
    select public.canonical_cups_identity(cups)
    from public.supplies
    group by public.canonical_cups_identity(cups)
    having count(*) > 1
  ) then
    raise exception 'canonical_cups_identity_conflict';
  end if;
end;
$$;

create unique index if not exists supplies_canonical_cups_identity_unique
on public.supplies (public.canonical_cups_identity(cups));
