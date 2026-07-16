alter table cases
  add column if not exists customer_name text,
  add column if not exists customer_phone text;
