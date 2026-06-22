# Facebook Tokens — AsakanLeadFlow

## ภาพรวม Env Vars ที่ต้องการ

| Env Var | ใช้ทำอะไร | หมดอายุ? | จำเป็น? |
|---|---|---|---|
| `FB_PAGE_TOKEN_{pageId}` | ดึงข้อมูล Lead Form | ไม่หมด (Page token) | ✅ ต้องมี |
| `FB_MSG_TOKEN_{pageId}` | ตอบแชท Messenger | ไม่หมด (Page token) | ✅ ต้องมี |
| `FB_LEADGEN_TOKEN` | fallback lead retrieval (ถ้าไม่มี PAGE_TOKEN) | ไม่หมด | ⚡ แนะนำ |
| `FB_ADS_TOKEN` | ดึงชื่อ Campaign / Ad Set / Ad | 60 วัน (หรือไม่หมดถ้าใช้ System User) | 🔵 optional |
| `FB_VERIFY_TOKEN` | verify webhook กับ Facebook | ไม่หมด (คุณตั้งเอง) | ✅ ต้องมี |

---

## 1. Page Access Token (ไม่หมดอายุ)

ใช้สำหรับ: `FB_PAGE_TOKEN_{pageId}` และ `FB_MSG_TOKEN_{pageId}`

### วิธีขั้นตอน

1. ไปที่ [Meta for Developers](https://developers.facebook.com) → เลือก App ของคุณ
2. ไปที่ **Tools → Graph API Explorer**
3. มุมขวาบน เลือก **App** ของคุณ
4. กด **Generate Access Token** → เลือก **Page** ที่ต้องการ → อนุมัติสิทธิ์
   - ต้องขอ scope: `pages_messaging`, `leads_retrieval`, `pages_manage_metadata`
5. Token ที่ได้เป็น **Short-lived User Token** (อายุ 1 ชั่วโมง) → ต้องแปลงก่อน

### แปลงเป็น Long-lived Page Token

**ขั้นตอน 1 — แปลง User Token เป็น Long-lived (60 วัน):**
```
GET https://graph.facebook.com/v20.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={SHORT_LIVED_USER_TOKEN}
```

**ขั้นตอน 2 — ดึง Page Token จาก Long-lived User Token:**
```
GET https://graph.facebook.com/v20.0/{PAGE_ID}
  ?fields=access_token
  &access_token={LONG_LIVED_USER_TOKEN}
```

ค่า `access_token` ที่ได้จากขั้นตอน 2 คือ **Page Access Token ที่ไม่หมดอายุ** (ตราบที่ไม่ revoke สิทธิ์)

> **หา PAGE_ID ได้จากไหน?** เปิดเพจ Facebook → About → Page ID (ตัวเลขยาว)  
> **APP_ID / APP_SECRET** อยู่ใน Meta for Developers → App → Settings → Basic

---

## 2. User Access Token for Ads (FB_ADS_TOKEN)

ใช้สำหรับ: ดึงชื่อ Campaign, Ad Set, Ad ใน metadata ของลีด  
ต้องการ scope: `ads_read`

### วิธีที่ 1 — Graph API Explorer (หมดอายุ 60 วัน)

1. ไปที่ [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. กด **Generate Access Token**
3. เลือก scope เพิ่ม: **ads_read** (อาจต้องเลือก **ads_management** ด้วย)
4. แปลงเป็น Long-lived token ด้วยวิธีเดียวกับข้างบน (ขั้นตอน 1)
5. Token ที่ได้ใช้ได้ **60 วัน** — ต้อง refresh ทุก 2 เดือน

### วิธีที่ 2 — System User (ไม่หมดอายุ ✅ แนะนำ)

1. ไปที่ [Meta Business Suite](https://business.facebook.com) → **Settings**
2. เลือก **Users → System Users**
3. กด **Add** → ตั้งชื่อ (เช่น `crm-ads-reader`) → Role: **Employee**
4. กด **Add Assets** → เลือก **Ad Accounts** → เลือกบัญชีโฆษณา → สิทธิ์ **Analyst**
5. กลับมาที่ System User → กด **Generate New Token**
6. เลือก App ของคุณ → เลือก scope: `ads_read`
7. Token ที่ได้ไม่หมดอายุ

---

## 3. FB_VERIFY_TOKEN

ตั้งค่าเองได้เป็นอะไรก็ได้ (string ยาวๆ ไม่มีช่องว่าง) เช่น:
```
FB_VERIFY_TOKEN=my_secret_webhook_token_2025
```

ใส่ค่าเดียวกันใน:
- Vercel env var `FB_VERIFY_TOKEN`
- Meta App → Webhooks → Verify Token

---

## สรุป Env Vars ที่ต้องใส่ใน Vercel

```env
# --- ต้องมีทุกเพจ ---
FB_PAGE_TOKEN_<PAGE_ID>=EAAxxxxxxx   # lead form retrieval
FB_MSG_TOKEN_<PAGE_ID>=EAAxxxxxxx    # messenger reply

# --- Fallback (ถ้ามีแค่เพจเดียวใส่ตัวนี้พอ) ---
FB_LEADGEN_TOKEN=EAAxxxxxxx

# --- Webhook ---
FB_VERIFY_TOKEN=your_secret_string

# --- Optional: ชื่อ Campaign/Ad ---
FB_ADS_TOKEN=EAAxxxxxxx              # User/System User token ที่มี ads_read
```

> **หมายเหตุ**: `<PAGE_ID>` คือตัวเลข ID ของ Facebook Page เช่น `FB_PAGE_TOKEN_103959052166459`
