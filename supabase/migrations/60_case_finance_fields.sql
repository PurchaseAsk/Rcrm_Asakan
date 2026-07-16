alter table cases
  add column if not exists payment_type text check (payment_type in ('cash', 'loan')),
  add column if not exists loan_banks text[] default '{}';
