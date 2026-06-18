import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (
    p.get("hub.mode") === "subscribe" &&
    p.get("hub.verify_token") === process.env.FB_VERIFY_TOKEN
  ) {
    return new NextResponse(p.get("hub.challenge"), { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const payload = body as {
    object?: string;
    entry?: {
      id: string;
      messaging?: {
        sender: { id: string };
        message?: {
          mid: string;
          text?: string;
          is_echo?: boolean;
          attachments?: { type: string; payload: { url?: string } }[];
        };
      }[];
    }[];
  };

  if (payload.object !== "page") return NextResponse.json({ status: "ignored" });

  const supabase = adminSupabase();

  for (const entry of payload.entry ?? []) {
    const fbPageId = entry.id;
    console.log("[webhook] entry.id =", fbPageId);

    const { data: page, error: pageError } = await supabase
      .from("facebook_pages")
      .select("id, token")
      .eq("page_id", fbPageId)
      .single();

    console.log("[webhook] page found =", !!page, "error =", pageError?.message);
    if (!page) continue;

    for (const event of entry.messaging ?? []) {
      if (!event.message || event.message.is_echo) continue;

      const hasText = !!event.message.text;
      const hasAttachment = (event.message.attachments?.length ?? 0) > 0;
      if (!hasText && !hasAttachment) continue;

      const senderPsid = event.sender.id;
      const fbMessageId = event.message.mid;
      const text = event.message.text ?? null;
      const attachment = event.message.attachments?.[0] ?? null;

      const { data: conv } = await supabase
        .from("conversations")
        .upsert(
          {
            page_id: page.id,
            sender_psid: senderPsid,
            last_message_at: new Date().toISOString(),
          },
          { onConflict: "page_id,sender_psid" },
        )
        .select("id, sender_name")
        .single();

      if (!conv) continue;

      await supabase.from("messages").upsert(
        {
          conversation_id: conv.id,
          direction: "inbound",
          content: text,
          attachment_url: attachment?.payload?.url ?? null,
          attachment_type: attachment?.type ?? null,
          fb_message_id: fbMessageId,
        },
        { onConflict: "fb_message_id", ignoreDuplicates: true },
      );

      if (!conv.sender_name && page.token) {
        void enrichSenderName(supabase, conv.id, senderPsid, String(page.token));
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function enrichSenderName(
  supabase: SupabaseClient,
  convId: string,
  psid: string,
  token: string,
) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${psid}?fields=name&access_token=${token}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { name?: string };
    if (data.name) {
      await supabase.from("conversations").update({ sender_name: data.name }).eq("id", convId);
    }
  } catch {
    // non-critical
  }
}
