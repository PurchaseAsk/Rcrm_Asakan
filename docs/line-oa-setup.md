# การเชื่อม LINE Official Account เข้า CRM

## สิ่งที่ต้องเตรียม

- LINE Official Account ที่เปิดใช้ **Messaging API** แล้ว
- สิทธิ์ Admin ใน CRM
- สิทธิ์เข้า Supabase SQL Editor

---

## ขั้นตอนที่ 1 — รัน Migration (ครั้งแรกครั้งเดียว)

เปิด **Supabase → SQL Editor** แล้วรันไฟล์:

```
supabase/migrations/23_line_oa.sql
```

สร้าง 3 ตาราง: `line_oa_accounts`, `line_conversations`, `line_messages`

---

## ขั้นตอนที่ 2 — ดึงข้อมูลจาก LINE

### 2.1 เปิด LINE Official Account Manager
ไปที่ [manager.line.biz](https://manager.line.biz) → เลือก OA ที่ต้องการ → **ตั้งค่า → Messaging API**

จดข้อมูล:
- **Channel ID** (ตัวเลข เช่น `2010497202`)
- **Channel Secret** (ตัวอักษรยาว)

### 2.2 ไปดึง Channel Access Token
กดลิงก์ **"ตั้งค่าเพิ่มเติมที่ LINE Developers Console"** → เลือก channel → tab **Messaging API**

เลื่อนลงหาส่วน **Channel access token** → กด **Issue** → Copy token

---

## ขั้นตอนที่ 3 — บันทึกข้อมูล OA ลง CRM

รันใน **Supabase → SQL Editor**:

```sql
INSERT INTO line_oa_accounts (name, channel_id, channel_secret, channel_access_token)
VALUES (
  'ชื่อโครงการ เช่น Wela Condo',
  'Channel ID ที่ได้จากข้อ 2.1',
  'Channel Secret ที่ได้จากข้อ 2.1',
  'Channel Access Token ที่ได้จากข้อ 2.2'
);
```

> ถ้ามีหลาย OA ให้รัน INSERT ซ้ำสำหรับแต่ละ OA

---

## ขั้นตอนที่ 4 — ตั้งค่า Webhook ใน LINE Developers Console

1. ไปที่ **LINE Developers Console** → เลือก channel → tab **Messaging API**
2. ส่วน **Webhook settings**:
   - **Webhook URL**: `https://rcrm-asakan.vercel.app/api/webhook/line`
   - กด **Verify** — ต้องขึ้น Success
3. เปิด toggle **Use webhook** ให้เป็น ON

---

## ขั้นตอนที่ 5 — ทดสอบ

1. ส่งข้อความเข้า LINE OA ที่เชื่อมไว้
2. เปิด CRM → tab **Line**
3. ควรเห็นแชทใหม่พร้อมชื่อผู้ส่งภายในไม่กี่วินาที

---

## กรณีมีหลาย OA (หลายโครงการ)

ทำซ้ำ **ขั้นตอนที่ 2–4** สำหรับแต่ละ OA โดย:
- Webhook URL ใช้ URL เดียวกันทุก OA: `https://rcrm-asakan.vercel.app/api/webhook/line`
- CRM แยกแชทด้วย `bot_user_id` อัตโนมัติ ไม่ต้องตั้งค่าเพิ่ม
- ใน tab Line จะมี dropdown กรองตาม OA เมื่อมีมากกว่า 1 บัญชี

---

## แก้ปัญหาเบื้องต้น

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| แชทไม่เข้า CRM เลย | `Use webhook` ยังปิดอยู่ | เปิด toggle ใน LINE Developers Console |
| Verify ไม่ผ่าน | Webhook URL ผิด | ตรวจสอบ URL ให้ตรงกับข้อ 4 |
| แชทเข้าแต่ไม่มีชื่อ | Profile enrichment ล้มเหลว | ตรวจสอบ `channel_access_token` ว่าถูกต้อง |
| ไม่เห็นแชทใหม่ใน UI | ยังไม่ได้รัน migration | รัน `23_line_oa.sql` ในข้อ 1 |
