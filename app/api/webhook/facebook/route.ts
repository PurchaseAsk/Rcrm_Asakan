import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// What Facebook sends in the leadgen webhook change value
type LeadgenWebhookValue = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
};

type FbEntry = {
  id: string;
  messaging?: {
    sender: { id: string };
    recipient: { id: string };
    message?: {
      mid: string;
      text?: string;
      is_echo?: boolean;
      attachments?: { type: string; payload: { url?: string } }[];
    };
  }[];
  changes?: { field: string; value: LeadgenWebhookValue }[];
};

// Full lead data returned by Graph API GET /{leadgen_id}
type LeadgenApiResult = {
  field_data?: { name: string; values: string[] }[];
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
};

type AdApiResult = {
  name?: string;
  adset?: { name?: string };
  campaign?: { name?: string };
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
    const pageToken = page.token ? String(page.token) : null;
    const pageEnvToken = (process.env[`FB_PAGE_TOKEN_${fbPageId}`] as string | undefined) ?? null;
    const leadgenToken = pageEnvToken ?? pageToken ?? process.env.FB_LEADGEN_TOKEN ?? null;
    const msgToken = (process.env[`FB_MSG_TOKEN_${fbPageId}`] as string | undefined) ?? pageToken ?? null;

    // ── Facebook Lead Ads (leadgen form submission) ───────────────────────────
    // adsToken: User token with ads_read for reading ad/campaign names
    const adsToken = process.env.FB_LEADGEN_TOKEN ?? leadgenToken;
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      if (leadgenToken) {
        await handleLeadgen(supabase, page.id, change.value, leadgenToken, adsToken ?? leadgenToken);
      }
    }

    // ── Facebook Messenger ────────────────────────────────────────────────────
    for (const event of entry.messaging ?? []) {
      if (!event.message) continue;

      const isEcho = !!event.message.is_echo;
      // echo = sent by page admin via FB Messenger; sender.id is the page, recipient.id is the user
      const senderPsid = isEcho ? event.recipient.id : event.sender.id;

      const hasText = !!event.message.text;
      const hasAttachment = (event.message.attachments?.length ?? 0) > 0;
      if (!hasText && !hasAttachment) continue;

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
          direction: isEcho ? "outbound" : "inbound",
          content: text,
          attachment_url: attachment?.payload?.url ?? null,
          attachment_type: attachment?.type ?? null,
          fb_message_id: fbMessageId,
        },
        { onConflict: "fb_message_id", ignoreDuplicates: true },
      );

      if (!isEcho && !conv.sender_name && msgToken) {
        void enrichSenderName(supabase, conv.id, senderPsid, msgToken, fbPageId);
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function handleLeadgen(
  supabase: SupabaseClient,
  pageId: string,
  webhookValue: LeadgenWebhookValue,
  pageToken: string,
  adsToken: string,
) {
  const { leadgen_id } = webhookValue;
  if (!leadgen_id) return;

  // Fetch full field data from Graph API (webhook only sends the ID)
  const leadData = await fetchLeadgenData(leadgen_id, pageToken);
  if (!leadData) return;

  const fields = leadData.field_data ?? [];
  const get = (name: string) => fields.find((f) => f.name === name)?.values[0] ?? null;

  const rawPhone = get("phone_number") ?? get("phone");
  const name = get("full_name") ?? get("name") ?? get("first_name");
  const email = get("email");

  // Fetch ad/campaign names — requires User token with ads_read (not page token)
  const adId = webhookValue.ad_id ?? leadData.ad_id;
  const adDetails = adId ? await fetchAdDetails(adId, adsToken) : null;

  const metadata = {
    ...(adId ? { ad_id: adId } : {}),
    ...(adDetails?.ad_name ? { ad_name: adDetails.ad_name } : {}),
    ...(webhookValue.adset_id ?? leadData.adset_id
      ? { adset_id: webhookValue.adset_id ?? leadData.adset_id }
      : {}),
    ...(adDetails?.adset_name ? { adset_name: adDetails.adset_name } : {}),
    ...(webhookValue.campaign_id ?? leadData.campaign_id
      ? { campaign_id: webhookValue.campaign_id ?? leadData.campaign_id }
      : {}),
    ...(adDetails?.campaign_name ? { campaign_name: adDetails.campaign_name } : {}),
    ...(webhookValue.form_id ?? leadData.form_id
      ? { form_id: webhookValue.form_id ?? leadData.form_id }
      : {}),
  };

  const activitySuffix = adDetails?.campaign_name ? ` · แคมเปญ: ${adDetails.campaign_name}` : "";

  // Insert-first: facebook_lead_id UNIQUE index prevents duplicates at DB level
  const { data: lead } = await supabase
    .from("leads")
    .insert({
      customer_name: name ?? "Facebook Lead",
      phone: rawPhone ?? null,
      email: email ?? null,
      page_id: pageId,
      source: "facebook",
      status: "active",
      facebook_lead_id: leadgen_id,
      metadata: Object.keys(metadata).length ? metadata : null,
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (lead) {
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      type: "created",
      content: `สร้างลีดจาก Facebook Lead Form${activitySuffix}`,
      created_by: null,
    });
    await supabase.rpc("distribute_lead", { p_lead_id: lead.id });
    return;
  }

  // Insert failed — find existing lead by phone and merge
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
      ...(Object.keys(metadata).length ? { metadata } : {}),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  await supabase.from("lead_activities").insert({
    lead_id: existing.id,
    type: "note",
    content: `Facebook Lead Form received — merged with existing lead (same phone)${activitySuffix}`,
    created_by: null,
  });
}

async function fetchLeadgenData(leadgenId: string, token: string): Promise<LeadgenApiResult | null> {
  try {
    const url = `https://graph.facebook.com/v20.0/${leadgenId}?fields=field_data,ad_id,adset_id,campaign_id,form_id&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as LeadgenApiResult;
  } catch {
    return null;
  }
}

async function fetchAdDetails(
  adId: string,
  token: string,
): Promise<{ ad_name: string | null; adset_name: string | null; campaign_name: string | null }> {
  try {
    const url = `https://graph.facebook.com/v20.0/${adId}?fields=name,adset{name},campaign{name}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return { ad_name: null, adset_name: null, campaign_name: null };
    const data = (await res.json()) as AdApiResult;
    return {
      ad_name: data.name ?? null,
      adset_name: data.adset?.name ?? null,
      campaign_name: data.campaign?.name ?? null,
    };
  } catch {
    return { ad_name: null, adset_name: null, campaign_name: null };
  }
}

async function enrichSenderName(
  supabase: SupabaseClient,
  convId: string,
  psid: string,
  token: string,
  fbPageId: string,
) {
  try {
    // Use Conversations API — direct /{psid}?fields=name is no longer supported
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${fbPageId}/conversations?user_id=${psid}&fields=participants&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as unknown;
      console.error("[enrichSenderName] Conversations API error psid=%s body=%s", psid, JSON.stringify(errBody));
      return;
    }
    type ConvApiResult = { data?: { participants?: { data?: { name?: string; id?: string }[] } }[] };
    const data = (await res.json()) as ConvApiResult;
    const participants = data.data?.[0]?.participants?.data ?? [];
    const user = participants.find((p) => p.id !== fbPageId);
    if (user?.name) {
      await supabase.from("conversations").update({ sender_name: user.name }).eq("id", convId);
    }
  } catch (e) {
    console.error("[enrichSenderName] fetch error psid=%s", psid, e);
  }
}
