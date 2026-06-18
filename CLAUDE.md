# CLAUDE.md — ReadyPlanet CRM (Supabase Edition)

> อัปเดตล่าสุด: 2026-04-14
> ไฟล์นี้สรุปองค์ความรู้หลักของโปรเจกต์ — อัปเดตทุกครั้งที่มีการเปลี่ยนแปลง core

---

## 1. ภาพรวมโปรเจกต์

Web app CRM คล้าย ReadyPlanet CRM สำหรับจัดการลีดจาก Facebook
- **Single HTML file**: `rcrm_supabase.html` — ไม่มี build step
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + RLS)
- **Frontend**: Alpine.js v3 + Tailwind CSS CDN
- **ภาษา**: ไทยเป็นหลัก

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| UI Reactivity | Alpine.js v3 (`x-data`, `x-model`, computed getters) |
| Styling | Tailwind CSS CDN |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Password + Magic Link) |
| Realtime | Supabase Realtime (postgres_changes on leads) |
| Font | Kanit (Google Fonts) |

**Supabase credentials (hardcoded ใน init()):**
```js
const DEFAULT_URL = 'https://ujkccnggzabawmllwcgz.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## 3. Database Schema

### Tables (ตามลำดับ dependency)

```
profiles          ← auth.users (trigger: handle_new_user)
teams
team_members      → teams, profiles
funnel_stages     → pipelines (nullable = global stage)
facebook_pages    → profiles (owner)
pipelines         → profiles (created_by)
pipeline_teams    → pipelines, teams
pipeline_users    → pipelines, profiles
leads             → facebook_pages, funnel_stages, profiles, pipelines
lead_activities   → leads, profiles
tags              → profiles
lead_tags         → leads, tags
distribution_rules → facebook_pages, teams, pipelines (nullable)
auto_recall_rules → funnel_stages
lead_reminders    → leads, profiles
```

### คอลัมน์สำคัญ

**profiles**: `id, email, full_name, role (admin|team_lead|staff), avatar_url`

**leads**: `id, customer_name, facebook_id, phone, email, value, page_id, stage_id, pipeline_id, assigned_to, status (active|unfollowed), source, metadata, last_activity_at`

**funnel_stages**: `id, name, position, color, is_unfollow, pipeline_id (null=global)`

**distribution_rules**: `id, page_id, team_id, pipeline_id, method (round_robin|random), config jsonb {last_index?, user_ids?}, is_active`

**pipelines**: `id, name, description, color, is_active, created_by`

**lead_reminders**: `id, lead_id, remind_at, note, created_by, is_done`

---

## 4. Migrations (ต้องรันตามลำดับ)

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `001_init.sql` | Schema ทั้งหมด + RLS + triggers + seed data | รันแล้ว |
| `002_fix_profiles_policy.sql` | เพิ่ม INSERT policy สำหรับ profiles | รันแล้ว |
| `003_fix_trigger.sql` | Fix `handle_new_user` ให้มี `set search_path = public` | รันแล้ว |
| `004_add_reminders.sql` | สร้าง `lead_reminders` table + `value` column ใน leads | รันแล้ว |
| `005_add_pipelines.sql` | สร้าง pipelines, pipeline_teams, pipeline_users + เพิ่ม `pipeline_id` ใน funnel_stages, leads | รันแล้ว |
| `006_setup_admin.sql` | SQL สำหรับ promote user เป็น admin (แก้ email ก่อนรัน) | รันแล้ว |
| `007_distribution_pipeline.sql` | เพิ่ม `pipeline_id` ใน distribution_rules | รันแล้ว |

---

## 5. RLS Helper Functions

```sql
my_role()              -- คืน role ของ user ปัจจุบัน ('admin'|'team_lead'|'staff')
my_team_member_ids()   -- คืน UUID ของสมาชิกทีมทั้งหมดที่ user อยู่ด้วย
```

### RLS Role Matrix

| Action | admin | team_lead | staff |
|---|---|---|---|
| เห็นลีด | ทั้งหมด | ทีมตัวเอง + pool | ของตัวเอง + pool |
| สร้าง pipeline | ✓ | ✓ | ✗ |
| สร้าง recall rule | ✓ | ✓ | ✗ |
| สร้าง distribution rule | ✓ | ✓ | ✗ |
| จัดการ stage | ✓ | ✓ | ✗ |

---

## 6. Business Logic

### Lead Flow (เมื่อลีดเข้าระบบ)

```
Facebook Page (เช่น "Wela Page")
       ↓
Distribution Rule: Page → Pipeline + Team/Users + Method
       ↓
clientDistributeLead() อัปเดต lead ครั้งเดียว:
  lead.pipeline_id = Pipeline ปลายทาง
  lead.stage_id    = ขั้นตอนแรกของ Pipeline นั้น (position ต่ำสุด, !is_unfollow)
  lead.assigned_to = สมาชิกทีมตาม round-robin หรือ random
```

### Pipeline = Funnel

- **Pipeline** คือ workspace/project แต่ละอัน มี funnel stage เป็นของตัวเอง
- `funnel_stages.pipeline_id = NULL` = global stage (ใช้ร่วมกัน)
- `funnel_stages.pipeline_id = X` = stage เฉพาะของ pipeline X
- เมื่อเลือก pipeline ใน UI → `pipelineStages` computed จะ filter stages ให้อัตโนมัติ
- ถ้า pipeline ไม่มี stage → fallback ไปใช้ global stages

### Auto Recall

- `auto_recall_rules` ผูกกับ `funnel_stages.id` (ไม่ใช่ pipeline โดยตรง)
- `runRecall()` รันฝั่ง client ทุกครั้งที่กดปุ่ม หรือ trigger จาก cron (ถ้ามี)
- Lead ที่ไม่มี activity ตาม `inactive_days` จะถูก `assigned_to = null` (กองกลาง)

### Reminder

- `lead_reminders` เก็บ remind_at, note, is_done
- `startReminderChecker()` ตั้ง `setInterval` ทุก 30 วินาที
- เมื่อถึงเวลา → toast แจ้งเตือน + mark `is_done = true`

---

## 7. Vue ของ Role (Visibility)

```js
// ใน visibleLeads getter:
admin     → เห็นทุก lead (filtered by pipeline ถ้าเลือก)
team_lead → เห็นลีดของสมาชิกในทีม + pool (assigned_to IS NULL)
staff     → เห็นลีดของตัวเอง + pool
```

---

## 8. State หลักใน crmApp()

```js
// Data
leads, stages, teams, pages, tags, pipelines
distRules, recallRules, profilesAll, activities

// Active/selected
activeTab, activePipelineId, selectedLead, leadFilter
managingPipeline (pipeline ที่กำลัง edit ใน mgmt modal)

// Pipeline mgmt modal
pipelineMgmtTab ('stages'|'recall'|'members')
mgmtStages      ← computed, stages ของ managingPipeline
mgmtRecallRules ← computed, recall rules ของ mgmtStages
mgmtPipelineTeams, mgmtPipelineUsers
mgmtNewStage    {name, color, is_unfollow, _open}
mgmtNewRecall   {stage_id, inactive_days, recall_to}
```

### Computed Properties หลัก

| Computed | คืนค่า |
|---|---|
| `visibleLeads` | leads ที่ role เห็นได้ + filter pipeline |
| `pipelineStages` | stages ของ activePipeline (fallback → global) |
| `myPipelines` | pipelines ที่ user มีสิทธิ์เข้าถึง |
| `filteredLeads` | visibleLeads filtered by leadFilter (active/unfollowed) |
| `mgmtStages` | stages ของ managingPipeline |
| `mgmtRecallRules` | recall rules ที่ผูกกับ mgmtStages |
| `recallCountdown` | นับถอยหลังก่อน recall สำหรับ selectedLead |

---

## 9. Menu Tabs

| id | label | สิทธิ์ |
|---|---|---|
| `dashboard` | แดชบอร์ด | ทุกคน |
| `leads` | กล่องลีด | ทุกคน |
| `funnel` | Funnel | ทุกคน |
| `teams` | ทีม | ทุกคน |
| `rules` | กฎกระจาย | admin/team_lead |
| `recall` | เรียกคืน | admin/team_lead |
| `stages` | Funnel ตั้งค่า | admin/team_lead |
| `tags` | แท็ก | ทุกคน |
| `pipelines` | Pipelines | ทุกคน (เห็นเฉพาะที่ตัวเองอยู่) |
| `pages` | เพจ | admin/team_lead |

---

## 10. Pipeline Management Modal

เปิดด้วย `openPipelineMgmt(pipeline)` — มี 3 tabs:

1. **ขั้นตอน Funnel** (default)
   - Horizontal card layout คล้าย ReadyPlanet
   - Card แต่ละใบ: หมายเลข, ชื่อ (แก้ inline ได้), สี, badge, ปุ่ม ◀▶ เลื่อน, ลบ
   - Card "+" เพิ่ม stage ใหม่
   - Template: 📈 Sales, 🏠 อสังหาฯ, 🎓 Service/Course

2. **กฎเรียกคืน**
   - แสดง recall rules เฉพาะ stages ของ pipeline นี้
   - เพิ่ม/ลบ/เปิดปิดได้

3. **สมาชิก**
   - Assign ทีมและผู้ใช้รายบุคคล

---

## 11. Known Issues & Fixes Applied

| ปัญหา | สาเหตุ | Fix |
|---|---|---|
| FK error สร้าง facebook_pages | Missing INSERT policy บน profiles | `002_fix_profiles_policy.sql` |
| "Database error saving new user" | trigger ไม่มี `set search_path = public` | `003_fix_trigger.sql` |
| Signup ไม่ทำงาน | Email confirmation เปิดอยู่ | แสดง pending state + instructions |
| RLS violation บน recall/pipeline | User เป็น staff ไม่มีสิทธิ์ write | Promote เป็น admin ด้วย `006_setup_admin.sql` |
| จำลองลีดไม่เข้า pipeline | สุ่มเพจโดยไม่สนใจ distribution rule | `simulateLead()` เลือกเพจที่มี rule ชี้ไปยัง activePipeline ก่อน → ถ้าไม่มีก็เลือกเพจที่มี rule+pipeline_id ใดก็ได้ → ถ้าไม่มีเลยสุ่ม |

---

## 12. Stage Template สำเร็จรูป (applyStageTemplate)

**Real Estate (อสังหาฯ):**
ลีดใหม่ → โทรติดต่อ → กำลังติดตาม → ส่งคูปอง → นัดเข้าชม → เข้าชมแล้ว → ปิดจอง → ทำสัญญา → เลิกติดตาม

**Sales:**
ลีดใหม่ → ติดต่อแล้ว → นำเสนอ → ปิดการขาย → เลิกติดตาม

**Service/Course:**
สนใจ → ส่งข้อมูล → ทดลองใช้ → สมัคร/ซื้อแล้ว → เลิกติดตาม
