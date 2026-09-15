-- Endesa invoices persist the electricity tax as a structured tax line.
-- Keep the dedicated electricity_tax_eur column and allow the matching detail row.

alter table public.invoice_tax_lines
  drop constraint if exists invoice_tax_lines_tax_type_check;

alter table public.invoice_tax_lines
  add constraint invoice_tax_lines_tax_type_check
  check (tax_type = any (array[
    'IVA'::text,
    'IGIC'::text,
    'OTHER'::text,
    'ELECTRICITY_TAX'::text
  ]));
