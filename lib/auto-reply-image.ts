import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

const WIDTH = 1080;
const PADDING = 48;
const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = "auto-reply-images";
const BLUE = "#0084ff";
const fontPath = path.join(process.cwd(), "assets/fonts/Sarabun-Regular.ttf");
const emojiPath = path.join(process.cwd(), "assets/fonts/NotoColorEmoji.ttf");
let emojiReady: Promise<unknown> | undefined;

export type AutoReplyImageSetting = {
  page_id: string;
  greeting_text: string;
  image_url: string;
  updated_at: string;
};

function escapeMarkup(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textMarkup(text: string) {
  const segments = new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text);
  return Array.from(segments, ({ segment }) => {
    const escaped = escapeMarkup(segment);
    return /\p{Extended_Pictographic}/u.test(segment)
      ? `<span font_family="Noto Color Emoji">${escaped}</span>`
      : escaped;
  }).join("");
}

export function validateAutoReplyText(text: unknown): asserts text is string {
  if (typeof text !== "string" || !text.trim()) throw new Error("กรุณาใส่ข้อความทักทาย");
  if (text.length > 5000) throw new Error("ข้อความสำหรับภาพรวมต้องไม่เกิน 5,000 ตัวอักษร");
}

// No fixed text height: wrap Thai at word/character boundaries and retain every line.
export async function renderAutoReplyImage(text: string, coupon: Buffer): Promise<Buffer> {
  validateAutoReplyText(text);
  if (!coupon.length || coupon.length > MAX_BYTES) throw new Error("รูปคูปองต้องมีขนาดไม่เกิน 5 MB");
  // Register the bundled fallback once; Linux deployments need an emoji font too.
  emojiReady ??= sharp({ text: { text: "😊", font: "Noto Color Emoji 40", fontfile: emojiPath, rgba: true } })
    .png().toBuffer().catch((error) => { emojiReady = undefined; throw error; });
  await emojiReady;

  const layers: sharp.OverlayOptions[] = [];
  let y = PADDING;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) { y += 28; continue; }
    const { data, info } = await sharp({
      text: {
        text: `<span foreground="white">${textMarkup(line)}</span>`,
        font: "Sarabun, Noto Color Emoji 40",
        fontfile: fontPath,
        width: WIDTH - PADDING * 2,
        wrap: "word-char",
        spacing: 10,
        rgba: true,
      },
    }).png().toBuffer({ resolveWithObject: true });
    layers.push({ input: data, left: PADDING, top: y });
    y += Math.max(info.height, 44) + 12;
    if (y > 12000) throw new Error("ข้อความยาวเกินขนาดภาพที่ส่งได้ กรุณาลดจำนวนบรรทัด");
  }
  const headerHeight = y + PADDING - 12;
  const resized = await sharp(coupon, { limitInputPixels: 40_000_000 })
    .rotate().resize({ width: WIDTH }).png().toBuffer({ resolveWithObject: true });
  const height = headerHeight + resized.info.height;
  if (height > 16000) throw new Error("รูปคูปองสูงเกินขนาดภาพที่ส่งได้");
  const header = await sharp({ create: { width: WIDTH, height: headerHeight, channels: 4, background: BLUE } }).png().toBuffer();
  const composed = await sharp({ create: { width: WIDTH, height, channels: 4, background: "white" } })
    .composite([{ input: header, left: 0, top: 0 }, ...layers, { input: resized.data, left: 0, top: headerHeight }])
    .png().toBuffer();
  const mask = Buffer.from(`<svg width="${WIDTH}" height="${height}"><rect width="${WIDTH}" height="${height}" rx="44" fill="white"/></svg>`);
  const result = await sharp(composed).composite([{ input: mask, blend: "dest-in" }]).png({ compressionLevel: 9 }).toBuffer();
  if (result.length > MAX_BYTES) throw new Error("ภาพรวมมีขนาดเกิน 5 MB กรุณาใช้รูปคูปองที่เล็กลง");
  return result;
}

// Only download images uploaded to our own bucket; never fetch arbitrary server URLs.
export function validateAutoReplyImageUrl(imageUrl: string) {
  const url = new URL(imageUrl);
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (url.origin !== project.origin || url.username || url.password ||
      !url.pathname.startsWith(`/storage/v1/object/public/${BUCKET}/`)) {
    throw new Error("กรุณาอัปโหลดรูปคูปองผ่านหน้าตั้งค่า Auto-Reply");
  }
  return url;
}

export async function loadAutoReplyCoupon(imageUrl: string): Promise<Buffer> {
  const response = await fetch(validateAutoReplyImageUrl(imageUrl), {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.body) throw new Error("โหลดรูปคูปองไม่สำเร็จ กรุณาลองใหม่");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error("รูปคูปองต้องมีขนาดไม่เกิน 5 MB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export function autoReplyImagePath(setting: AutoReplyImageSetting) {
  // Normalise the DB's +00:00 timestamps and JS's Z timestamps to the same version.
  const version = new Date(setting.updated_at).toISOString();
  const hash = createHash("sha256").update(JSON.stringify([1, setting.greeting_text, setting.image_url, version])).digest("hex");
  return `combined/${setting.page_id}/${hash}.png`;
}

export async function ensureAutoReplyImage(supabase: SupabaseClient, setting: AutoReplyImageSetting): Promise<string> {
  validateAutoReplyText(setting.greeting_text);
  validateAutoReplyImageUrl(setting.image_url);
  const storage = supabase.storage.from(BUCKET);
  const key = autoReplyImagePath(setting);
  const { data: { publicUrl } } = storage.getPublicUrl(key);
  const exists = async () => {
    const res = await fetch(publicUrl, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (res.ok) return true;
    if (res.status === 404 || res.status === 400) return false;
    throw new Error("ตรวจสอบภาพ Auto-Reply ไม่สำเร็จ กรุณาลองใหม่");
  };
  if (await exists()) return publicUrl;
  const image = await renderAutoReplyImage(setting.greeting_text, await loadAutoReplyCoupon(setting.image_url));
  const { error } = await storage.upload(key, image, { contentType: "image/png", cacheControl: "31536000", upsert: false });
  // Two inbound webhooks can prepare the same immutable image concurrently.
  if (error && !(await exists())) throw new Error("บันทึกภาพ Auto-Reply ไม่สำเร็จ: " + error.message);
  return publicUrl;
}
