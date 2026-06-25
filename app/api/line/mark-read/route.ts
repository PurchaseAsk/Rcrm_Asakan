import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { conversation_id } = (await request.json()) as { conversation_id: string };
  if (!conversation_id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: conv } = await supabase
    .from("line_conversations")
    .select("sender_line_id, line_oa_accounts(channel_access_token)")
    .eq("id", conversation_id)
    .single();

  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const token = (conv.line_oa_accounts as unknown as { channel_access_token: string } | null)?.channel_access_token;
  if (!token) return NextResponse.json({ error: "No token" }, { status: 500 });

  await fetch("https://api.line.me/v2/bot/message/markAsRead", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ chat: { type: "user", userId: conv.sender_line_id } }),
  });

  return NextResponse.json({ ok: true });
}
