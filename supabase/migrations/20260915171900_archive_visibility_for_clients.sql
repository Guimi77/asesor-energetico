create or replace function private.can_access_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'private'
as $$
  select private.is_internal_user()
     or exists (
       select 1
       from public.client_users cu
       join public.profiles p on p.id = cu.user_id
       join public.clients c on c.id = cu.client_id
       where cu.user_id = auth.uid()
         and cu.client_id = target_client
         and p.active = true
         and p.role = 'client'
         and c.status = 'active'
     )
$$;

create or replace function private.client_id_for_holder(target_holder uuid)
returns uuid
language sql
stable
security definer
set search_path = 'public', 'private'
as $$
  select h.client_id
  from public.holders h
  where h.id = target_holder
    and (private.is_internal_user() or h.status = 'active')
$$;

create or replace function private.client_id_for_supply(target_supply uuid)
returns uuid
language sql
stable
security definer
set search_path = 'public', 'private'
as $$
  select h.client_id
  from public.supplies s
  join public.holders h on h.id = s.holder_id
  join public.clients c on c.id = h.client_id
  where s.id = target_supply
    and (
      private.is_internal_user()
      or (s.status = 'active' and h.status = 'active' and c.status = 'active')
    )
$$;

create or replace function private.client_id_for_invoice(target_invoice uuid)
returns uuid
language sql
stable
security definer
set search_path = 'public', 'private'
as $$
  select private.client_id_for_supply(i.supply_id)
  from public.invoices i
  where i.id = target_invoice
$$;

drop policy if exists holders_select on public.holders;
create policy holders_select on public.holders
for select to authenticated
using (
  private.is_internal_user()
  or (status = 'active' and private.can_access_client(client_id))
);

drop policy if exists supplies_select on public.supplies;
create policy supplies_select on public.supplies
for select to authenticated
using (
  private.is_internal_user()
  or (status = 'active' and private.can_access_client(private.client_id_for_holder(holder_id)))
);
