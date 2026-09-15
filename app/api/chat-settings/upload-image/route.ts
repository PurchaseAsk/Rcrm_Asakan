import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireChatSettingsEditor } from "@/lib/chat-settings-auth";

export async function POST(request: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const auth = await requireChatSettingsEditor(request, supabase);
  if (auth.error) return auth.error;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const pageId = formData.get("page_id") as string | null;

  if (!file || !pageId) {
    return NextResponse.json({ error: "Missing file or page_id" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5 MB" }, { status: 400 });
  }

  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  const ext = extensions[file.type];
  if (!ext) return NextResponse.json({ error: "กรุณาใช้รูป JPG, PNG, WebP หรือ GIF" }, { status: 400 });
  const path = `pages/${pageId}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("auto-reply-images")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage
    .from("auto-reply-images")
    .getPublicUrl(path);

  return NextResponse.json({ url: publicUrl });
}
