import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { loadAutoReplyCoupon, renderAutoReplyImage } from "@/lib/auto-reply-image";
import { requireChatSettingsEditor } from "@/lib/chat-settings-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const auth = await requireChatSettingsEditor(request, supabase);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const image = await renderAutoReplyImage(body.greeting_text, await loadAutoReplyCoupon(body.image_url));
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "สร้างภาพตัวอย่างไม่สำเร็จ" }, { status: 400 });
  }
}
