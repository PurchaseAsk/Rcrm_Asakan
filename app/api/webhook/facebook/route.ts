import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Mirror of SQL normalize_phone() — strip non-digits, +66/66 → 0
function normalizePhone(phone: string): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("66")) return "0" + digits.slice(2);
  return digits;
}

type LeadgenValue = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  field_data?: { name: string; values: string[] }[];
};

type FbEntry = {
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
  changes?: { field: string; value: LeadgenValue }[];
};

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

  const payload = body as { object?: string; entry?: FbEntry[] };

  if (payload.object !== "page") return NextResponse.json({ status: "ignored" });

  const supabase = adminSupabase();

  for (const entry of payload.entry ?? []) {
    const fbPageId = entry.id;

    const { data: page } = await supabase
      .from("facebook_pages")
      .select("id, token")
      .eq("page_id", fbPageId)
      .single();

    if (!page) continue;

    // ── Facebook Lead Ads (leadgen form submission) ───────────────────────────
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      await handleLeadgen(supabase, page.id, change.value);
    }

    // ── Facebook Messenger ────────────────────────────────────────────────────
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

async function handleLeadgen(
  supabase: SupabaseClient,
  pageId: string,
  value: LeadgenValue,
) {
  const fields = value.field_data ?? [];
  const get = (name: string) => fields.find((f) => f.name === name)?.values[0] ?? null;

  const rawPhone = get("phone_number") ?? get("phone");
  const name = get("full_name") ?? get("name");
  const email = get("email");

  // Attempt insert first. If the unique index on normalize_phone(phone) fires
  // (race condition or pre-existing lead), Supabase returns null data with no rows.
  // We then fall back to find-and-merge so the webhook never errors on duplicates.
  // TODO: for full reliability, log raw payload to a facebook_lead_events table
  //       before processing, so no submission is ever silently lost.
  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      customer_name: name ?? "Facebook Lead",
      phone: rawPhone ?? null,
      email: email ?? null,
      page_id: pageId,
      source: "facebook",
      status: "active",
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (lead) {
    // New lead created — log activity and distribute
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      type: "created",
      content: "สร้างลีดจาก Facebook Lead Form",
      created_by: null,
    });
    await supabase.rpc("distribute_lead", { p_lead_id: lead.id });
    return;
  }

  // Insert failed (unique conflict or other error) — find the existing lead and merge
  void insertError; // acknowledged; merging instead
  if (!rawPhone) return;
  const { data: dups } = await supabase.rpc("find_lead_by_phone", { p_phone: rawPhone }) as {
    data: { id: string; customer_name: string }[] | null;
  };
  const existing = dups?.[0];
  if (!existing) return;

  await supabase
    .from("leads")
    .update({
      ...(email ? { email } : {}),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  await supabase.from("lead_activities").insert({
    lead_id: existing.id,
    type: "note",
    content: `Facebook Lead Form received — merged with existing lead (same phone)`,
    created_by: null,
  });
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
