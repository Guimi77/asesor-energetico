alter table public.clients add column if not exists alias text;
alter table public.supplies add column if not exists alias text;

comment on column public.clients.alias is 'Nombre corto o identificador interno del cliente; no sustituye la razon social o nombre legal.';
comment on column public.supplies.alias is 'Nombre corto o identificador interno del punto de suministro; no sustituye el CUPS ni la direccion.';
