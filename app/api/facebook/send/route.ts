import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isFacebookAuthError, resolveMessengerSendMode } from "@/lib/facebook-send";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    conversation_id: string;
    text: string;
    sent_by?: string;
    reply_to_message_id?: string | null;
    reply_to_text?: string | null;
  };
  const { conversation_id, text, sent_by, reply_to_message_id } = body;

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
  // Native Messenger replies are drawn by Facebook from the original message MID.
  // Do not put the quoted text in the outbound body: customers would see it as one
  // long blue bubble instead of Messenger's "Replying to…" card.
  let replyToFbMessageId: string | null = null;
  if (reply_to_message_id) {
    const { data: replyTarget } = await supabase
      .from("messages")
      .select("fb_message_id")
      .eq("id", reply_to_message_id)
      .eq("conversation_id", conversation_id)
      .maybeSingle();
    replyToFbMessageId = replyTarget?.fb_message_id ?? null;
  }

  const messagePayload: Record<string, unknown> = { text: trimmedText };
  const sendMode = await resolveMessengerSendMode(supabase, conversation_id);
  if ("error" in sendMode) {
    return NextResponse.json({ error: sendMode.error }, { status: 400 });
  }

  const sendToFacebook = async (payload: Record<string, unknown>, replyMid = replyToFbMessageId) =>
    fetch(`https://graph.facebook.com/v20.0/${page.page_id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${page.token}`,
      },
      body: JSON.stringify({
        recipient: { id: senderPsid },
        message: messagePayload,
        ...(replyMid ? { reply_to: { mid: replyMid } } : {}),
        ...payload,
      }),
    });

  let humanAgentFallback = false;
  let nativeReplyFallback = false;
  let fbRes = await sendToFacebook(sendMode.payload);
  type FbError = { error?: { code?: number; message?: string } };

  // Keep the reply visually clean even if Meta cannot reference this particular
  // original message (for example, it was unsent). The fallback sends only the
  // agent's answer — never the old quoted-text prefix.
  if (!fbRes.ok && replyToFbMessageId) {
    const nativeReplyError = (await fbRes.json()) as FbError;
    console.warn("[send] native reply failed; sending clean text instead", nativeReplyError.error?.message);
    fbRes = await sendToFacebook(sendMode.payload, null);
    nativeReplyFallback = true;
  }

  if (!fbRes.ok) {
    const err = (await fbRes.json()) as FbError;
    const code = err.error?.code;
    if (sendMode.mode === "response" && !isFacebookAuthError(code)) {
      console.log("[send] RESPONSE failed code=%d msg=%s - retrying with HUMAN_AGENT", code, err.error?.message);
      fbRes = await sendToFacebook({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
      if (!fbRes.ok) {
        const err2 = (await fbRes.json()) as FbError;
        console.error("[send] HUMAN_AGENT also failed code=%d msg=%s", err2.error?.code, err2.error?.message);
        return NextResponse.json(
          { error: err2.error?.message ?? "Facebook API error" },
          { status: 500 },
        );
      }
      humanAgentFallback = true;
    } else {
      return NextResponse.json(
        { error: err.error?.message ?? "Facebook API error" },
        { status: 500 },
      );
    }
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

  return NextResponse.json({
    ok: true,
    send_mode: sendMode.mode,
    human_agent_fallback: humanAgentFallback,
    native_reply: Boolean(replyToFbMessageId) && !nativeReplyFallback,
  });
}
