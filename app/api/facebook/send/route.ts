import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    conversation_id: string;
    text: string;
    sent_by?: string;
    reply_to_message_id?: string | null;
    reply_to_text?: string | null;
  };
  const { conversation_id, text, sent_by, reply_to_message_id, reply_to_text } = body;

  if (!conversation_id || !text?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

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

  if (!page?.token) {
    return NextResponse.json({ error: "No page token configured" }, { status: 400 });
  }

  const senderPsid = (conv as unknown as { sender_psid: string }).sender_psid;

  const trimmedText = text.trim();
  const quoteText = reply_to_text?.trim();
  const quotePreview = quoteText && quoteText.length > 180 ? `${quoteText.slice(0, 180)}...` : quoteText;
  const outboundText = quotePreview ? `ตอบกลับข้อความ:\n"${quotePreview}"\n\n${trimmedText}` : trimmedText;

  const fbRes = await fetch(`https://graph.facebook.com/v20.0/${page.page_id}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${page.token}`,
    },
    body: JSON.stringify({
      recipient: { id: senderPsid },
      message: { text: outboundText },
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

  await Promise.all([
    supabase.from("messages").insert({
      conversation_id,
      direction: "outbound",
      content: trimmedText,
      sent_by: sent_by ?? null,
      fb_message_id: fbData.message_id ?? null,
      reply_to_message_id: reply_to_message_id ?? null,
    }),
    supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_text: trimmedText, last_message_direction: "outbound", customer_read_at: null })
      .eq("id", conversation_id),
  ]);

  return NextResponse.json({ ok: true });
}
