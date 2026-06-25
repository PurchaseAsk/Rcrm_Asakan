import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const conversationId = form.get("conversation_id") as string | null;
  const sentBy = form.get("sent_by") as string | null;
  const file = form.get("file") as File | null;

  if (!conversationId || !file) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: conv } = await supabase
    .from("line_conversations")
    .select("id, sender_line_id, line_oa_accounts(channel_access_token)")
    .eq("id", conversationId)
    .single();

  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const oaRecord = conv.line_oa_accounts as unknown as { channel_access_token: string } | null;
  const accessToken = oaRecord?.channel_access_token;
  if (!accessToken) return NextResponse.json({ error: "No token" }, { status: 500 });

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `line/${conversationId}/${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("chat-attachments")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to: conv.sender_line_id,
      messages: [{
        type: "image",
        originalContentUrl: publicUrl,
        previewImageUrl: publicUrl,
      }],
    }),
  });

  if (!lineRes.ok) {
    const err = await lineRes.json().catch(() => ({}));
    console.error("[line-send-image] push error", err);
    return NextResponse.json({ error: "LINE send failed" }, { status: 500 });
  }

  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("line_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: null,
      attachment_type: "image",
      attachment_url: publicUrl,
      sent_by: sentBy || null,
    }),
    supabase.from("line_conversations").update({
      last_message_text: "[รูปภาพ]",
      last_message_at: now,
      last_message_direction: "outbound",
    }).eq("id", conversationId),
  ]);

  return NextResponse.json({ ok: true, url: publicUrl });
}
