-- ============================================================
-- FIX: เพิ่ม INSERT policy สำหรับ profiles
-- รันใน Supabase Dashboard → SQL Editor
-- ============================================================

-- เพิ่ม policy ที่ขาดไป: ให้ user สร้าง profile ตัวเองได้
drop policy if exists "profiles: insert own" on profiles;
create policy "profiles: insert own"
  on profiles for insert
  with check (id = auth.uid());

-- ถ้ายังไม่มี profile ของ user ที่มีอยู่แล้ว ให้รันนี้ด้วย:
-- (แทนที่ 'your-user-uuid' ด้วย UUID จาก Supabase Auth → Users)
-- insert into profiles (id, email, full_name, role)
-- select id, email, split_part(email,'@',1), 'admin'
-- from auth.users
-- on conflict (id) do nothing;
