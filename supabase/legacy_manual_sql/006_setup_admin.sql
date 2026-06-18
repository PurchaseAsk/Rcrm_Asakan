-- ============================================================
-- SETUP: ตั้ง role ของ user เป็น admin
-- รันใน Supabase Dashboard → SQL Editor
-- ============================================================

-- ── วิธีที่ 1: promote ด้วย email (แก้ email ให้ตรงกับ account ของคุณ) ──
update profiles
set role = 'admin'
where email = 'nnote1985@gmail.com';   -- ← เปลี่ยนเป็น email ของคุณ

-- ── วิธีที่ 2: promote user คนแรกเป็น admin อัตโนมัติ ──
-- (ใช้ถ้าไม่รู้ email, จะ promote user ที่สร้างบัญชีเก่าสุด)
-- update profiles
-- set role = 'admin'
-- where id = (select id from profiles order by created_at asc limit 1);

-- ── ตรวจสอบผลลัพธ์ ──
select id, email, role from profiles order by created_at;
