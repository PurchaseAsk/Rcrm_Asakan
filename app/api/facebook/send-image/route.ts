import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const conversationId = form.get("conversation_id") as string | null;
  const sentBy = form.get("sent_by") as string | null;
  const file = form.get("file") as File | null;

  if (!conversationId || !file) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = adminSupabase();

  // Look up conversation → page token + PSID
  const { data: conv } = await supabase
    .from("conversations")
    .select("sender_psid, facebook_pages!inner(page_id, token)")
    .eq("id", conversationId)
    .single();

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  type PageRow = { page_id: string; token: string };
  const page = (conv as unknown as { sender_psid: string; facebook_pages: PageRow }).facebook_pages;
  const senderPsid = (conv as unknown as { sender_psid: string }).sender_psid;

  if (!page?.token) {
    return NextResponse.json({ error: "No page token" }, { status: 400 });
  }

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${conversationId}/${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("chat-attachments")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  // Send to Facebook via Send API
  const fbRes = await fetch(`https://graph.facebook.com/v20.0/${page.page_id}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${page.token}`,
    },
    body: JSON.stringify({
      recipient: { id: senderPsid },
      message: {
        attachment: {
          type: "image",
          payload: { url: publicUrl, is_reusable: true },
        },
      },
      messaging_type: "RESPONSE",
    }),
  });

  if (!fbRes.ok) {
    const err = (await fbRes.json()) as { error?: { message?: string } };
    return NextResponse.json(
      { error: err.error?.message ?? "Facebook API error" },
      { status: 500 },
    );
  }

  const fbData = (await fbRes.json()) as { message_id?: string };

  // Save to DB
  await Promise.all([
    supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: null,
      attachment_url: publicUrl,
      attachment_type: "image",
      sent_by: sentBy ?? null,
      fb_message_id: fbData.message_id ?? null,
    }),
    supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_text: "[รูปภาพ]" })
      .eq("id", conversationId),
  ]);

  return NextResponse.json({ ok: true });
}
