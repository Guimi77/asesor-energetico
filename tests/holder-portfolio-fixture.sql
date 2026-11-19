-- Synthetic isolated schema for the real SQL integration test. No production
-- credentials or customer data are required. Never run against an existing DB.
create schema auth;
create schema private;

do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.profiles(id uuid primary key references auth.users, role text, active boolean);
create function private.current_role() returns text language sql stable security definer
set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active is true
$$;
create function private.is_internal_user() returns boolean language sql stable security definer
set search_path = '' as $$
  select coalesce(private.current_role() in ('admin', 'staff'), false)
$$;

create table public.clients(
  id uuid primary key, name text not null, tax_id text, client_type text,
  status text not null default 'active', updated_at timestamptz default now()
);
create table public.holders(
  id uuid primary key, client_id uuid not null references public.clients on delete restrict,
  legal_name text not null, tax_id text, status text not null default 'active',
  updated_at timestamptz default now()
);
create table public.supplies(
  id uuid primary key, holder_id uuid not null references public.holders on delete restrict,
  cups text not null unique, status text not null default 'active',
  current_contract_number text, updated_at timestamptz default now()
);
create table public.invoices(
  id uuid primary key, supply_id uuid not null references public.supplies,
  source_holder_name text, source_holder_tax_id text, amount numeric,
  validation_status text, superseded_by uuid, issue_date date,
  billing_start date, billing_end date, created_at timestamptz default now()
);
create table public.invoice_energy_periods(
  invoice_id uuid references public.invoices, period text, energy_kwh numeric
);
create table public.supply_events(
  id bigint generated always as identity, supply_id uuid references public.supplies,
  event_date date, event_type text, title text, description text,
  before_value jsonb, after_value jsonb, created_by uuid
);
create table public.audit_log(
  id bigint generated always as identity, actor_user_id uuid, action text,
  entity_type text, entity_id uuid, details jsonb, created_at timestamptz default now()
);

insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004');
insert into public.profiles(id, role, active) values
  ('10000000-0000-4000-8000-000000000001', 'admin', true),
  ('10000000-0000-4000-8000-000000000002', 'staff', true),
  ('10000000-0000-4000-8000-000000000003', 'client', true),
  ('10000000-0000-4000-8000-000000000004', 'admin', false);
insert into public.clients(id, name, tax_id, client_type) values
  ('20000000-0000-4000-8000-000000000001', 'CLIENTE DE PRUEBA UNO', 'TESTCLIENT1', 'EMPRESA'),
  ('20000000-0000-4000-8000-000000000002', 'CLIENTE DE PRUEBA DOS', 'TESTCLIENT2', 'EMPRESA');
insert into public.holders(id, client_id, legal_name, tax_id) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'TITULAR DE PRUEBA UNO', 'TESTHOLDER1'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'TITULAR DE PRUEBA DOS', 'TESTHOLDER2'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'TITULAR VACIO DE PRUEBA', 'TESTEMPTY');
insert into public.supplies(id, holder_id, cups, status, current_contract_number) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'TEST-SUPPLY-ACTIVE', 'active', 'TEST-CONTRACT-1'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'TEST-SUPPLY-INACTIVE', 'inactive', 'TEST-CONTRACT-2'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'TEST-SUPPLY-ARCHIVED', 'archived', 'TEST-CONTRACT-3'),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000002', 'TEST-SUPPLY-OTHER', 'active', 'TEST-CONTRACT-4');
insert into public.invoices(id, supply_id, source_holder_name, source_holder_tax_id, amount, validation_status) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'TITULAR ANTERIOR DE PRUEBA', 'TESTPAST', 42.75, 'valid'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', 'TITULAR DE PRUEBA UNO', 'TESTHOLDER1', 23.40, 'valid');
insert into public.invoice_energy_periods(invoice_id, period, energy_kwh) values
  ('50000000-0000-4000-8000-000000000001', 'P1', 123.45),
  ('50000000-0000-4000-8000-000000000002', 'P2', 67.89);

create function pg_temp.assert_true(p_ok boolean, p_message text) returns void
language plpgsql as $$ begin
  if p_ok is not true then raise exception 'Assertion failed: %', p_message; end if;
end $$;
