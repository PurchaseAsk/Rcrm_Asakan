import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegram, tg } from "@/lib/telegram";

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

type FeedChangeValue = {
  item?: string;
  verb?: string;
  comment_id?: string;
  post_id?: string;
  parent_id?: string;
  from?: { id: string; name?: string };
  message?: string;
  created_time?: number;
};

type FbReferral = {
  source?: string;
  type?: string;
  ad_id?: string;
  ads_context_data?: { ad_title?: string; photo_url?: string; post_id?: string };
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
    referral?: FbReferral;
    read?: { watermark: number };
  }[];
  changes?: { field: string; value: LeadgenWebhookValue | FeedChangeValue | Record<string, unknown> }[];
};

// Full lead data returned by Graph API GET /{leadgen_id}
type LeadgenApiResult = {
  field_data?: { name: string; values: string[] }[];
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  ad?: { name?: string };
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
      .select("id, name, token")
      .eq("page_id", fbPageId)
      .single();

    if (!page) continue;
    const pageToken = page.token ? String(page.token) : null;
    const pageEnvToken = (process.env[`FB_PAGE_TOKEN_${fbPageId}`] as string | undefined) ?? null;
    const leadgenToken = pageEnvToken ?? pageToken ?? process.env.FB_LEADGEN_TOKEN ?? null;
    const msgToken = (process.env[`FB_MSG_TOKEN_${fbPageId}`] as string | undefined) ?? pageToken ?? null;

    // ── Facebook Lead Ads (leadgen) + Feed (comments) ────────────────────────
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen") {
        console.log("[webhook] leadgen event received", { fbPageId, leadgen_id: (change.value as LeadgenWebhookValue).leadgen_id, hasToken: !!leadgenToken });
        if (leadgenToken) {
          await handleLeadgen(supabase, page.id, page.name ?? "", change.value as LeadgenWebhookValue, leadgenToken);
        } else {
          console.error("[webhook] leadgen skipped — no token for page", fbPageId);
        }
        continue;
      }
      if (change.field === "feed") {
        const val = change.value as FeedChangeValue;
        if (val.item === "comment" && val.verb === "add" && val.comment_id) {
          // Skip our own replies echoed back
          if (val.from?.id !== fbPageId && (!val.parent_id || !val.post_id || val.parent_id === val.post_id)) {
            await supabase.from("page_comments").upsert({
              page_id: page.id,
              fb_comment_id: val.comment_id,
              fb_post_id: val.post_id ?? "",
              from_user_id: val.from?.id ?? null,
              from_user_name: val.from?.name ?? null,
              message: val.message ?? null,
              fb_created_time: val.created_time ? new Date(val.created_time * 1000).toISOString() : null,
            }, { onConflict: "fb_comment_id", ignoreDuplicates: true });
          }
        }
        continue;
      }
    }

    // ── Facebook Messenger ────────────────────────────────────────────────────
    for (const event of entry.messaging ?? []) {
      const senderPsid = event.message?.is_echo ? event.recipient.id : event.sender.id;

      // ── Read receipt (customer read our messages) ─────────────────────────────
      if (event.read) {
        const readAt = new Date(event.read.watermark).toISOString();
        console.log("[webhook] message_reads received", { senderPsid, pageId: page.id, watermark: event.read.watermark, readAt });
        const { error: readErr } = await supabase
          .from("conversations")
          .update({ customer_read_at: readAt })
          .eq("page_id", page.id)
          .eq("sender_psid", senderPsid);
        if (readErr) {
          console.error("[webhook] customer_read_at update failed:", readErr.message);
        } else {
          console.log("[webhook] customer_read_at updated ok");
        }
        continue;
      }

      // ── Referral-only event (Click-to-Messenger ad click, before any message) ──
      // Facebook sends this when user clicks the Message button on an ad.
      // It has no message body — just the referral with ad attribution.
      if (!event.message && event.referral?.ad_id) {
        const adId = event.referral.ad_id;
        const refPayload: Record<string, unknown> = {
          page_id: page.id,
          sender_psid: senderPsid,
          last_message_at: new Date().toISOString(),
          ad_id: adId,
        };
        if (event.referral.ads_context_data?.ad_title) {
          refPayload.ad_name = event.referral.ads_context_data.ad_title;
        } else {
          // Webhook didn't include ad_title — fetch via User Access Token (ads_read)
          const adsToken = process.env.FB_ADS_TOKEN ?? null;
          if (adsToken) {
            const names = await fetchAdCampaignNames(adId, null, null, adsToken);
            if (names.adName) refPayload.ad_name = names.adName;
          }
        }
        await supabase
          .from("conversations")
          .upsert(refPayload, { onConflict: "page_id,sender_psid" });
        continue;
      }

      if (!event.message) continue;

      const isEcho = !!event.message.is_echo;

      const hasText = !!event.message.text;
      const hasAttachment = (event.message.attachments?.length ?? 0) > 0;
      if (!hasText && !hasAttachment) continue;

      const fbMessageId = event.message.mid;
      const text = event.message.text ?? null;
      const attachment = event.message.attachments?.[0] ?? null;

      // Capture ad referral (present on first user message when no automated reply preceded it)
      const referral = event.referral;
      const refAdId = referral?.ad_id ?? null;
      const refAdNameFromWebhook = referral?.ads_context_data?.ad_title ?? null;

      const convPayload: Record<string, unknown> = {
        page_id: page.id,
        sender_psid: senderPsid,
        last_message_at: new Date().toISOString(),
        last_message_text: text ?? (attachment ? `[${attachment.type === "image" ? "รูปภาพ" : attachment.type}]` : null),
        last_message_direction: isEcho ? "outbound" : "inbound",
      };
      // Only set ad fields when referral is present — avoids overwriting on later messages
      if (refAdId) {
        convPayload.ad_id = refAdId;
        if (refAdNameFromWebhook) {
          convPayload.ad_name = refAdNameFromWebhook;
        } else {
          // Fetch ad name via User Access Token (ads_read) as fallback
          const adsToken = process.env.FB_ADS_TOKEN ?? null;
          if (adsToken) {
            const names = await fetchAdCampaignNames(refAdId, null, null, adsToken);
            if (names.adName) convPayload.ad_name = names.adName;
          }
        }
      }

      const { data: conv } = await supabase
        .from("conversations")
        .upsert(convPayload, { onConflict: "page_id,sender_psid" })
        .select("id, sender_name, created_at")
        .single();

      if (!conv) continue;

      const isNewConversation = !isEcho && Date.now() - new Date(conv.created_at).getTime() < 15_000;
      if (isNewConversation) {
        const senderLabel = tg(conv.sender_name || senderPsid);
        const msgPreview = tg(text ? (text.length > 120 ? text.slice(0, 120) + "…" : text) : "[รูปภาพ]");
        void sendTelegram(`💬 <b>แชทใหม่</b>\n👤 ${senderLabel}\n📄 ${tg(page.name)}\n💬 ${msgPreview}`);
      }

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
        await enrichSenderName(supabase, conv.id, senderPsid, msgToken, fbPageId);
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function handleLeadgen(
  supabase: SupabaseClient,
  pageId: string,
  pageName: string,
  webhookValue: LeadgenWebhookValue,
  pageToken: string,
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

  const adId = webhookValue.ad_id ?? leadData.ad_id ?? null;
  const adsetId = webhookValue.adset_id ?? leadData.adset_id ?? null;
  const campaignId = webhookValue.campaign_id ?? leadData.campaign_id ?? null;
  const formId = webhookValue.form_id ?? leadData.form_id ?? null;
  const formName = formId ? await fetchFormName(formId, pageToken) : null;

  // Fetch ad/campaign names via User Access Token (ads_read) if configured
  let adName: string | null = null;
  let adsetName: string | null = null;
  let campaignName: string | null = null;
  const adsToken = process.env.FB_ADS_TOKEN ?? null;
  if (adsToken && (adId || adsetId || campaignId)) {
    const names = await fetchAdCampaignNames(adId, adsetId, campaignId, adsToken);
    adName = names.adName;
    adsetName = names.adsetName;
    campaignName = names.campaignName;
  }

  const metadata = {
    ...(adId ? { ad_id: adId } : {}),
    ...(adName ? { ad_name: adName } : {}),
    ...(adsetId ? { adset_id: adsetId } : {}),
    ...(adsetName ? { adset_name: adsetName } : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
    ...(campaignName ? { campaign_name: campaignName } : {}),
    ...(formId ? { form_id: formId } : {}),
    ...(formName ? { form_name: formName } : {}),
  };

  const activitySuffix = campaignName ? ` · แคมเปญ: ${campaignName}` : "";

  // Look up target pipeline from distribution rule before insert so phone dedupe
  // is scoped to the same project/pipeline that distribution will use.
  const { data: distRule } = await supabase
    .from("distribution_rules")
    .select("pipeline_id")
    .eq("page_id", pageId)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const targetPipelineId: string | null = distRule?.pipeline_id ?? null;

  if (rawPhone) {
    const { data: dups } = await supabase.rpc("find_lead_by_phone", {
      p_phone: rawPhone,
      p_pipeline_id: targetPipelineId,
    }) as {
      data: { id: string; customer_name: string }[] | null;
    };
    const existing = dups?.[0];
    if (existing) {
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
      return;
    }
  }

  // Insert after phone dedupe; facebook_lead_id UNIQUE still handles retries
  // where no phone is available or the target pipeline changed.
  const { data: lead } = await supabase
    .from("leads")
    .insert({
      customer_name: name ?? "Facebook Lead",
      phone: rawPhone ?? null,
      email: email ?? null,
      page_id: pageId,
      pipeline_id: targetPipelineId,
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
    const parts = [
      `🧲 <b>ลีดใหม่ (Lead Form)</b>`,
      `👤 ${tg(name ?? "ไม่ระบุชื่อ")}`,
      rawPhone ? `📞 ${tg(rawPhone)}` : null,
      email ? `📧 ${tg(email)}` : null,
      campaignName ? `📢 ${tg(campaignName)}` : null,
      pageName ? `📄 ${tg(pageName)}` : null,
    ].filter(Boolean);
    await sendTelegram(parts.join("\n"));
    return;
  }

  // Insert failed — check if it's a duplicate facebook_lead_id (re-submission)
  const { data: existingByFbId } = await supabase
    .from("leads")
    .select("id, stage_id, funnel_stages(is_unfollow)")
    .eq("facebook_lead_id", leadgen_id)
    .single();

  if (existingByFbId) {
    type LeadWithStage = { id: string; stage_id: string | null; funnel_stages: { is_unfollow: boolean } | null };
    const existingLead = existingByFbId as unknown as LeadWithStage;
    const isUnfollowed = existingLead.funnel_stages?.is_unfollow === true;

    if (isUnfollowed) {
      // Lead was lost — treat re-submission as a brand new lead and redistribute
      const { data: newLead } = await supabase
        .from("leads")
        .insert({
          customer_name: name ?? "Facebook Lead",
          phone: rawPhone ?? null,
          email: email ?? null,
          page_id: pageId,
          pipeline_id: targetPipelineId,
          source: "facebook",
          status: "active",
          metadata: Object.keys(metadata).length ? metadata : null,
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (newLead) {
        await supabase.from("lead_activities").insert({
          lead_id: newLead.id,
          type: "created",
          content: `สร้างลีดใหม่จาก Facebook Lead Form (ส่งซ้ำหลังเลิกติดตาม)${activitySuffix}`,
          created_by: null,
        });
        await supabase.rpc("distribute_lead", { p_lead_id: newLead.id });
        await sendTelegram([`🧲 <b>ลีดใหม่ (Lead Form)</b>`, `👤 ${tg(name ?? "ไม่ระบุชื่อ")}`, rawPhone ? `📞 ${tg(rawPhone)}` : null, campaignName ? `📢 ${tg(campaignName)}` : null, pageName ? `📄 ${tg(pageName)}` : null].filter(Boolean).join("\n"));
      }
    } else {
      // Lead still active — just bump to top
      await supabase
        .from("leads")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", existingLead.id);
      await supabase.from("lead_activities").insert({
        lead_id: existingLead.id,
        type: "note",
        content: `ส่ง Lead Form ซ้ำอีกครั้ง${activitySuffix}`,
        created_by: null,
      });
    }
    return;
  }

  // Not duplicate — find existing lead by phone and merge
  if (!rawPhone) return;
  const { data: dups } = await supabase.rpc("find_lead_by_phone", {
    p_phone: rawPhone,
    p_pipeline_id: targetPipelineId,
  }) as {
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
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("[fetchLeadgenData] Graph API error", { leadgenId, status: res.status, body: errBody });
      return null;
    }
    return (await res.json()) as LeadgenApiResult;
  } catch (e) {
    console.error("[fetchLeadgenData] fetch exception", { leadgenId, error: e });
    return null;
  }
}

async function fetchAdCampaignNames(
  adId: string | null,
  adsetId: string | null,
  campaignId: string | null,
  adsToken: string,
): Promise<{ adName: string | null; adsetName: string | null; campaignName: string | null }> {
  const result = { adName: null as string | null, adsetName: null as string | null, campaignName: null as string | null };
  try {
    await Promise.all([
      adId
        ? fetch(`https://graph.facebook.com/v20.0/${adId}?fields=name&access_token=${encodeURIComponent(adsToken)}`)
            .then((r) => (r.ok ? (r.json() as Promise<{ name?: string }>) : null))
            .then((d) => { if (d?.name) result.adName = d.name; })
            .catch(() => {})
        : Promise.resolve(),
      adsetId
        ? fetch(`https://graph.facebook.com/v20.0/${adsetId}?fields=name&access_token=${encodeURIComponent(adsToken)}`)
            .then((r) => (r.ok ? (r.json() as Promise<{ name?: string }>) : null))
            .then((d) => { if (d?.name) result.adsetName = d.name; })
            .catch(() => {})
        : Promise.resolve(),
      campaignId
        ? fetch(`https://graph.facebook.com/v20.0/${campaignId}?fields=name&access_token=${encodeURIComponent(adsToken)}`)
            .then((r) => (r.ok ? (r.json() as Promise<{ name?: string }>) : null))
            .then((d) => { if (d?.name) result.campaignName = d.name; })
            .catch(() => {})
        : Promise.resolve(),
    ]);
  } catch { /* non-critical */ }
  return result;
}


async function fetchFormName(formId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${formId}?fields=name&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string };
    return data.name ?? null;
  } catch {
    return null;
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
