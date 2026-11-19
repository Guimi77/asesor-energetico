-- Extend the shared isolated holder fixture with the real master columns.
-- Only synthetic data is used; the runner refuses non-local/non-empty databases.
alter table public.clients
  alter column id set default gen_random_uuid(),
  add column created_at timestamptz not null default now(),
  add column notes text,
  add column created_by uuid;
alter table public.holders
  alter column id set default gen_random_uuid(),
  add column created_at timestamptz not null default now(),
  add column notes text,
  add column created_by uuid;
alter table public.supplies
  alter column id set default gen_random_uuid(),
  add column cups_key text generated always as (upper(regexp_replace(cups, '[^A-Za-z0-9]', '', 'g'))) stored,
  add column supply_name text,
  add column address text,
  add column city text,
  add column province text,
  add column postal_code text,
  add column current_tariff text,
  add column current_retailer text,
  add column current_distributor text,
  add column created_at timestamptz not null default now(),
  add column notes text,
  add column created_by uuid;

update public.supplies
set cups = case right(id::text, 1)
      when '1' then 'ES0000000000000001AA0F'
      when '2' then 'ES0000000000000002AA0F'
      when '3' then 'ES0000000000000003AA0F'
      else 'ES0000000000000004AA0F'
    end,
    supply_name = 'SUMINISTRO DE PRUEBA',
    address = 'DIRECCION SINTETICA',
    city = 'LOCALIDAD DE PRUEBA',
    province = 'PROVINCIA DE PRUEBA',
    postal_code = '00000',
    current_tariff = '3.0TD',
    current_retailer = 'COMERCIALIZADORA DE PRUEBA',
    current_distributor = 'DISTRIBUIDORA DE PRUEBA';
