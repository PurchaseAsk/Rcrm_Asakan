import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  let body: { conversation_id?: string; image_url?: string; sent_by?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  const { conversation_id, image_url, sent_by } = body;

  if (!conversation_id || !image_url) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = adminSupabase();

  const { data: conv } = await supabase
    .from("conversations")
    .select("sender_psid, facebook_pages!inner(page_id, token)")
    .eq("id", conversation_id)
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
          payload: { url: image_url, is_reusable: true },
        },
      },
      messaging_type: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
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

  await Promise.all([
    supabase.from("messages").insert({
      conversation_id,
      direction: "outbound",
      content: null,
      attachment_url: image_url,
      attachment_type: "image",
      sent_by: sent_by ?? null,
      fb_message_id: fbData.message_id ?? null,
    }),
    supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_text: "[รูปภาพ]", last_message_direction: "outbound", customer_read_at: null })
      .eq("id", conversation_id),
  ]);

  return NextResponse.json({ ok: true });
}
