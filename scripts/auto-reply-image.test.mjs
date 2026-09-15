import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { renderAutoReplyImage, autoReplyImagePath, validateAutoReplyImageUrl, ensureAutoReplyImage } from "../lib/auto-reply-image.ts";

const project = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = project;
const setting = {
  page_id: "page", greeting_text: "สวัสดีค่ะ 😊", image_url: `${project}/storage/v1/object/public/auto-reply-images/pages/page/coupon.jpg`,
  updated_at: "2026-09-15T06:00:00.000Z",
};

test("image keys change on edited text, replaced coupon or a new save, but tolerate DB timestamps", () => {
  const key = autoReplyImagePath(setting);
  assert.equal(key, autoReplyImagePath({ ...setting, updated_at: "2026-09-15T06:00:00+00:00" }));
  for (const change of [{ greeting_text: "New text" }, { image_url: setting.image_url + "?v=2" }, { updated_at: "2026-09-15T06:01:00Z" }]) {
    assert.notEqual(key, autoReplyImagePath({ ...setting, ...change }));
  }
});

test("source images are restricted to our own public auto-reply bucket", () => {
  assert.equal(validateAutoReplyImageUrl(setting.image_url).origin, project);
  for (const url of ["http://localhost/private", "https://other.supabase.co/storage/v1/object/public/auto-reply-images/a", `${project}/rest/v1/profiles`, `${project}/storage/v1/object/public/auto-reply-images/../private/a`]) {
    assert.throws(() => validateAutoReplyImageUrl(url));
  }
});

test("cached combined image is reused without rendering, downloading the coupon or writing", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => { requests.push([url, options.method]); return new Response(null, { status: 200 }); });
  const url = `${project}/storage/v1/object/public/auto-reply-images/${autoReplyImagePath(setting)}`;
  const storage = { getPublicUrl: () => ({ data: { publicUrl: url } }), upload: () => assert.fail("cache hit must not upload") };
  assert.equal(await ensureAutoReplyImage({ storage: { from: () => storage } }, setting), url);
  assert.deepEqual(requests, [[url, "HEAD"]]);
});

test("first use renders and uploads one immutable PNG from the complete greeting", async (t) => {
  const coupon = await sharp({ create: { width: 1080, height: 360, channels: 3, background: "red" } }).png().toBuffer();
  const requests = [];
  const uploads = [];
  const url = `${project}/storage/v1/object/public/auto-reply-images/${autoReplyImagePath(setting)}`;
  t.mock.method(globalThis, "fetch", async (input, options) => {
    requests.push([String(input), options.method ?? "GET"]);
    if (options.method === "HEAD") return new Response(null, { status: 404 });
    assert.equal(String(input), setting.image_url);
    return new Response(new Uint8Array(coupon), { status: 200 });
  });
  const storage = {
    getPublicUrl: () => ({ data: { publicUrl: url } }),
    upload: async (...args) => { uploads.push(args); return { error: null }; },
  };
  assert.equal(await ensureAutoReplyImage({ storage: { from: () => storage } }, setting), url);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0][0], autoReplyImagePath(setting));
  assert.equal(uploads[0][2].upsert, false);
  const actual = await sharp(uploads[0][1]).metadata();
  assert.equal(actual.format, "png");
  assert.ok(actual.height > 360);
  assert.deepEqual(requests, [[url, "HEAD"], [setting.image_url, "GET"]]);
});

test("Thai text, blank lines, emoji and markup characters render above an uncropped coupon", async () => {
  const coupon = await sharp({ create: { width: 1080, height: 360, channels: 3, background: "#b91c1c" } }).png().toBuffer();
  const short = await renderAutoReplyImage("สวัสดีค่ะ 😊", coupon);
  const long = await renderAutoReplyImage("🎟️ Wela VIP Day | 17–25 ตุลาคมนี้\n\nลงทะเบียนรับ คูปองส่วนลด 126,000 บาท\nใช้เป็นส่วนลดได้ ทุกยูนิตภายในวันงาน ✨\n\n📝แจ้งชื่อ + เบอร์โทรศัพท์\nผ่านแชทนี้ได้เลยค่ะ 😊\n\nAdmin เข้ามาดูแลและยืนยันสิทธิ์ภายใน 5 นาที\n\n👇 ตัวอย่าง Voucher ที่จะได้รับ\nA & B <ข้อความที่ต้องแสดงครบ>", coupon);
  const shortMeta = await sharp(short).metadata();
  const meta = await sharp(long).metadata();
  assert.equal(meta.width, 1080);
  assert.equal(meta.format, "png");
  assert.ok(meta.height > shortMeta.height, "long copy expands image height instead of truncation");
  assert.ok(long.length < 5 * 1024 * 1024);
  const bottom = await sharp(long).extract({ left: 540, top: meta.height - 100, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...bottom], [185, 28, 28], "coupon remains below text at full aspect ratio");
  const withBlank = await sharp(await renderAutoReplyImage("สวัสดี\n\nค่ะ", coupon)).metadata();
  const withoutBlank = await sharp(await renderAutoReplyImage("สวัสดี\nค่ะ", coupon)).metadata();
  assert.ok(withBlank.height > withoutBlank.height);
  await assert.rejects(renderAutoReplyImage(" ", coupon));
  await assert.rejects(renderAutoReplyImage("ก".repeat(5001), coupon));
});
