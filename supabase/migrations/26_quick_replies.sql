create table quick_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table quick_replies enable row level security;

create policy "Users manage own quick replies"
  on quick_replies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
