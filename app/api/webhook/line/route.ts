import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type LineEvent = {
  type: string;
  source: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string };
  timestamp: number;
};

type LineBody = { destination: string; events: LineEvent[] };

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const hash = createHmac("SHA256", secret).update(rawBody).digest("base64");
  return hash === signature;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  let body: LineBody;
  try {
    body = JSON.parse(rawBody) as LineBody;
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const supabase = adminSupabase();

  const { data: oaList } = await supabase
    .from("line_oa_accounts")
    .select("id, channel_secret, channel_access_token, bot_user_id")
    .eq("is_active", true);

  if (!oaList?.length) return NextResponse.json({ status: "no_oa" });

  let oa = oaList.find((a) => a.bot_user_id === body.destination);

  if (!oa) {
    oa = oaList.find((a) => verifySignature(rawBody, signature, a.channel_secret));
  }

  if (!oa) {
    console.error("[line-webhook] no matching OA for destination", body.destination);
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!oa.bot_user_id && body.destination) {
    await supabase.from("line_oa_accounts").update({ bot_user_id: body.destination }).eq("id", oa.id);
  }

  for (const event of body.events) {
    if (event.type !== "message") continue;
    const senderLineId = event.source.userId;
    if (!senderLineId) continue;

    const msgType = event.message?.type ?? "";
    if (!["text", "image", "sticker"].includes(msgType)) continue;

    const text = msgType === "text" ? (event.message?.text ?? null) : null;
    const displayText = text ?? (msgType === "image" ? "[รูปภาพ]" : "[สติกเกอร์]");

    const { data: conv } = await supabase
      .from("line_conversations")
      .upsert(
        {
          line_oa_id: oa.id,
          sender_line_id: senderLineId,
          last_message_text: displayText,
          last_message_at: new Date(event.timestamp).toISOString(),
          last_message_direction: "inbound",
        },
        { onConflict: "line_oa_id,sender_line_id" },
      )
      .select("id, display_name, picture_url")
      .single();

    if (!conv) continue;

    if (event.message?.id) {
      let attachmentUrl: string | null = null;
      if (msgType === "image") {
        attachmentUrl = await downloadLineImage(supabase, event.message.id, conv.id, oa.channel_access_token);
      }
      await supabase.from("line_messages").upsert(
        {
          conversation_id: conv.id,
          direction: "inbound",
          content: text,
          attachment_type: msgType !== "text" ? msgType : null,
          attachment_url: attachmentUrl,
          line_message_id: event.message.id,
        },
        { onConflict: "line_message_id", ignoreDuplicates: true },
      );
    }

    if (!conv.display_name || !conv.picture_url) {
      await enrichLineProfile(supabase, conv.id, senderLineId, oa.channel_access_token);
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function downloadLineImage(
  supabase: ReturnType<typeof adminSupabase>,
  messageId: string,
  convId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error("[line-image] content fetch failed", res.status, await res.text());
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
    const buffer = await res.arrayBuffer();
    const path = `line/${convId}/${messageId}.${ext}`;
    const { error } = await supabase.storage
      .from("chat-attachments")
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      console.error("[line-image] storage upload failed", error.message);
      return null;
    }
    const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
    console.log("[line-image] uploaded ok", data.publicUrl);
    return data.publicUrl;
  } catch (e) {
    console.error("[line-image] exception", e);
    return null;
  }
}

async function enrichLineProfile(
  supabase: ReturnType<typeof adminSupabase>,
  convId: string,
  userId: string,
  accessToken: string,
) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error("[line-enrich] profile API failed", res.status);
      return;
    }
    const data = (await res.json()) as { displayName?: string; pictureUrl?: string };
    console.log("[line-enrich] profile data:", JSON.stringify(data));
    await supabase
      .from("line_conversations")
      .update({ display_name: data.displayName ?? null, picture_url: data.pictureUrl ?? null })
      .eq("id", convId);
  } catch { /* non-critical */ }
}
