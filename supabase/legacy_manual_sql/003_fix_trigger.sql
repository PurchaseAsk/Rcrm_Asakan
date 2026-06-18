-- ============================================================
-- FIX: trigger handle_new_user ต้องมี search_path และ exception handler
-- รันใน Supabase Dashboard → SQL Editor
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public        -- สำคัญ: ไม่งั้น security definer หา table ไม่เจอ
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    'staff'
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- ไม่ให้ trigger crash ขวาง signup
    -- profile จะถูกสร้างตอน login ผ่าน ensureProfile() แทน
    raise warning 'handle_new_user error: %', sqlerrm;
    return new;
end;
$$;

-- re-create trigger (drop ก่อนเพื่อให้แน่ใจว่าใช้ function ใหม่)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
