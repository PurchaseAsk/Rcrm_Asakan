import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { conversation_id, text, sent_by } = (await request.json()) as {
    conversation_id: string;
    text: string;
    sent_by?: string;
  };

  if (!conversation_id || !text?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: conv } = await supabase
    .from("line_conversations")
    .select("id, sender_line_id, line_oa_accounts(channel_access_token)")
    .eq("id", conversation_id)
    .single();

  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const oaRecord = conv.line_oa_accounts as unknown as { channel_access_token: string } | null;
  const accessToken = oaRecord?.channel_access_token;
  if (!accessToken) return NextResponse.json({ error: "No token" }, { status: 500 });

  const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to: conv.sender_line_id,
      messages: [{ type: "text", text: text.trim() }],
    }),
  });

  if (!lineRes.ok) {
    const err = await lineRes.json().catch(() => ({}));
    console.error("[line-send] push error", err);
    return NextResponse.json({ error: "LINE send failed" }, { status: 500 });
  }

  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("line_messages").insert({
      conversation_id,
      direction: "outbound",
      content: text.trim(),
      sent_by: sent_by || null,
    }),
    supabase.from("line_conversations").update({
      last_message_text: text.trim(),
      last_message_at: now,
      last_message_direction: "outbound",
    }).eq("id", conversation_id),
  ]);

  return NextResponse.json({ ok: true });
}
