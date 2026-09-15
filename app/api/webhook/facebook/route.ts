import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegram, tg } from "@/lib/telegram";
import webpush from "web-push";
import { ensureAutoReplyImage } from "@/lib/auto-reply-image";

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
      reply_to?: { mid?: string; is_self_reply?: boolean };
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
  let hasLeadgenFailure = false;

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
          const ok = await handleLeadgen(supabase, page.id, page.name ?? "", change.value as LeadgenWebhookValue, leadgenToken, fbPageId);
          if (!ok) hasLeadgenFailure = true;
        } else {
          console.error("[webhook] leadgen skipped — no token for page", fbPageId);
          await wlog(supabase, "leadgen_skipped", {
            fb_page_id: fbPageId,
            leadgen_id: (change.value as LeadgenWebhookValue).leadgen_id ?? null,
            detail: { reason: "no_token" },
          });
        }
        continue;
      }
      if (change.field === "feed") {
        const val = change.value as FeedChangeValue;
        if (val.item === "comment" && val.verb === "add" && val.comment_id) {
          // Page replied to a comment from Facebook directly → auto-archive that comment
          if (val.from?.id === fbPageId && val.parent_id && val.post_id && val.parent_id !== val.post_id) {
            await supabase
              .from("page_comments")
              .update({ status: "archived", archive_reason: "done" })
              .eq("fb_comment_id", val.parent_id)
              .eq("status", "active");
          // New top-level comment from a user (not the page itself)
          } else if (val.from?.id !== fbPageId && (!val.parent_id || !val.post_id || val.parent_id === val.post_id)) {
            const postId = val.post_id ?? "";
            let postMessage: string | null = null;
            let permalinkUrl: string | null = null;

            if (postId && msgToken) {
              // Check cache first to avoid redundant Graph API calls
              const { data: cached } = await supabase
                .from("fb_post_cache")
                .select("post_message, permalink_url")
                .eq("fb_post_id", postId)
                .single();

              if (cached) {
                postMessage = cached.post_message ?? null;
                permalinkUrl = cached.permalink_url ?? null;
              } else {
                const postInfo = await fetchPostInfo(postId, msgToken);
                if (postInfo) {
                  postMessage = postInfo.message ?? postInfo.story ?? null;
                  permalinkUrl = postInfo.permalink_url ?? null;
                  await supabase.from("fb_post_cache").upsert({
                    fb_post_id: postId,
                    page_id: page.id,
                    post_message: postMessage,
                    permalink_url: permalinkUrl,
                    thumbnail_url: postInfo.full_picture ?? null,
                    fb_created_at: postInfo.created_time ?? null,
                  }, { onConflict: "fb_post_id" });
                }
              }
            }

            await supabase.from("page_comments").upsert({
              page_id: page.id,
              fb_comment_id: val.comment_id,
              fb_post_id: postId,
              from_user_id: val.from?.id ?? null,
              from_user_name: val.from?.name ?? null,
              message: val.message ?? null,
              fb_created_time: val.created_time ? new Date(val.created_time * 1000).toISOString() : null,
              post_message: postMessage,
              permalink_url: permalinkUrl,
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
      const repliedToFbMessageId = event.message.reply_to?.mid ?? null;
      const text = event.message.text ?? null;
      const attachment = event.message.attachments?.[0] ?? null;

      // Capture ad referral (present on first user message when no automated reply preceded it)
      const referral = event.referral;
      const refAdId = referral?.ad_id ?? null;
      const refAdNameFromWebhook = referral?.ads_context_data?.ad_title ?? null;

      // last_message_* fields are handled by the DB trigger on messages INSERT.
      // Do NOT set them here — Facebook retries old webhooks, which would
      // overwrite a newer outbound state with stale inbound data.
      const convPayload: Record<string, unknown> = {
        page_id: page.id,
        sender_psid: senderPsid,
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
        .select("id, sender_name, created_at, last_message_at")
        .single();

      if (!conv) continue;

      // Enrich name first so Telegram notification gets the real name, not PSID
      let senderName = conv.sender_name;
      if (!isEcho && !senderName && msgToken) {
        senderName = await enrichSenderName(supabase, conv.id, senderPsid, msgToken, fbPageId);
      }

      const isNewConversation = !isEcho && Date.now() - new Date(conv.created_at).getTime() < 15_000;
      if (isNewConversation) {
        const senderLabel = tg(senderName || senderPsid);
        const msgPreview = tg(text ? (text.length > 120 ? text.slice(0, 120) + "…" : text) : "[รูปภาพ]");
        void sendTelegram(`💬 <b>แชทใหม่</b>\n👤 ${senderLabel}\n📄 ${tg(page.name)}\n💬 ${msgPreview}`);
      }

      // Messenger gives us the original message MID when either participant
      // replies in the native UI. Resolve that external ID to our local UUID so
      // ChatInbox can render the quote card for inbound replies too.
      let replyToMessageId: string | null = null;
      if (repliedToFbMessageId) {
        const { data: replyTarget } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", conv.id)
          .eq("fb_message_id", repliedToFbMessageId)
          .maybeSingle();
        replyToMessageId = replyTarget?.id ?? null;
      }

      await supabase.from("messages").upsert(
        {
          conversation_id: conv.id,
          direction: isEcho ? "outbound" : "inbound",
          content: text,
          attachment_url: attachment?.payload?.url ?? null,
          attachment_type: attachment?.type ?? null,
          fb_message_id: fbMessageId,
          reply_to_message_id: replyToMessageId,
        },
        { onConflict: "fb_message_id", ignoreDuplicates: true },
      );

      // Auto-tag "รอส่งคูปอง" when customer texts a phone number (text-only, not echo)
      if (!isEcho && hasText && text) {
        await autoTagCoupon(supabase, conv.id, text);
      }

      // Web Push notification (inbound only, debounced per conversation)
      if (!isEcho) {
        void sendPushNotification(supabase, conv.id, senderName ?? conv.sender_name, text, attachment?.type ?? null);
      }

      // Auto-reply greeting (skip echoes — those are our own messages)
      if (!isEcho && msgToken) {
        await sendAutoReply(supabase, conv, page.id, senderPsid, msgToken, refAdId, isNewConversation);
      }
    }
  }

  // If any leadgen fetch failed, return 500 so Facebook retries the whole batch.
  // Leads already processed will be skipped by the facebook_lead_id UNIQUE constraint.
  if (hasLeadgenFailure) {
    return NextResponse.json({ status: "retry" }, { status: 500 });
  }
  return NextResponse.json({ status: "ok" });
}

async function wlog(
  supabase: SupabaseClient,
  event_type: string,
  fields: {
    fb_page_id?: string | null;
    leadgen_id?: string | null;
    lead_id?: string | null;
    phone?: string | null;
    name?: string | null;
    detail?: Record<string, unknown> | null;
  },
) {
  try { await supabase.from("webhook_logs").insert({ event_type, ...fields }); } catch { /* non-critical */ }
}

// Returns true on success (or non-retryable skip), false if Facebook should retry
async function handleLeadgen(
  supabase: SupabaseClient,
  pageId: string,
  pageName: string,
  webhookValue: LeadgenWebhookValue,
  pageToken: string,
  fbPageId: string,
): Promise<boolean> {
  const { leadgen_id } = webhookValue;
  if (!leadgen_id) return true;

  // Log receipt immediately — before any Graph API calls that could fail
  await wlog(supabase, "leadgen_received", {
    fb_page_id: fbPageId,
    leadgen_id,
    detail: { webhook_value: webhookValue },
  });

  // Fetch full field data from Graph API — retry once after 2s to handle transient errors
  let leadData = await fetchLeadgenData(leadgen_id, pageToken);
  if (!leadData) {
    await new Promise((r) => setTimeout(r, 2000));
    leadData = await fetchLeadgenData(leadgen_id, pageToken);
  }
  if (!leadData) {
    await wlog(supabase, "leadgen_error", {
      fb_page_id: fbPageId,
      leadgen_id,
      detail: { reason: "fetchLeadgenData failed after retry", webhook_value: webhookValue },
    });
    return false; // signal caller to return 500 so Facebook retries
  }

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
      await supabase.rpc("increment_lead_conversions", { p_lead_id: existing.id });
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
        content: `ส่ง Lead Form ใหม่อีกครั้ง (เบอร์ซ้ำกับลีดเดิม)${activitySuffix}`,
        created_by: null,
      });
      await wlog(supabase, "leadgen_merged", {
        fb_page_id: fbPageId,
        leadgen_id,
        lead_id: existing.id,
        phone: rawPhone,
        name,
        detail: { reason: "phone_dedupe", existing_lead_id: existing.id, pipeline_id: targetPipelineId },
      });
      const mergedParts = [
        `🔄 <b>ลีดส่งฟอร์มซ้ำ</b>`,
        `👤 ${tg(name ?? existing.customer_name)}`,
        rawPhone ? `📞 ${tg(rawPhone)}` : null,
        campaignName ? `📢 ${tg(campaignName)}` : null,
        pageName ? `📄 ${tg(pageName)}` : null,
      ].filter(Boolean);
      void sendTelegram(mergedParts.join("\n"));
      return true;
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

    // Resolve assignee name after distribution
    let assigneeName: string | null = null;
    const { data: assigned } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", lead.id)
      .single();
    if (assigned?.assigned_to) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", assigned.assigned_to)
        .single();
      assigneeName = prof?.full_name ?? prof?.email ?? null;
    }

    await wlog(supabase, "leadgen", {
      fb_page_id: fbPageId,
      leadgen_id,
      lead_id: lead.id,
      phone: rawPhone,
      name,
      detail: { pipeline_id: targetPipelineId, campaign: campaignName, assignee: assigneeName },
    });
    const parts = [
      `🧲 <b>ลีดใหม่ (Lead Form)</b>`,
      `👤 ${tg(name ?? "ไม่ระบุชื่อ")}`,
      rawPhone ? `📞 ${tg(rawPhone)}` : null,
      email ? `📧 ${tg(email)}` : null,
      campaignName ? `📢 ${tg(campaignName)}` : null,
      pageName ? `📄 ${tg(pageName)}` : null,
      `🙋 ${assigneeName ? tg(assigneeName) : "กองกลาง"}`,
    ].filter(Boolean);
    await sendTelegram(parts.join("\n"));
    return true;
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
        let reAssigneeName: string | null = null;
        const { data: reAssigned } = await supabase.from("leads").select("assigned_to").eq("id", newLead.id).single();
        if (reAssigned?.assigned_to) {
          const { data: reProf } = await supabase.from("profiles").select("full_name, email").eq("id", reAssigned.assigned_to).single();
          reAssigneeName = reProf?.full_name ?? reProf?.email ?? null;
        }
        await sendTelegram([`🧲 <b>ลีดใหม่ (Lead Form)</b>`, `👤 ${tg(name ?? "ไม่ระบุชื่อ")}`, rawPhone ? `📞 ${tg(rawPhone)}` : null, campaignName ? `📢 ${tg(campaignName)}` : null, pageName ? `📄 ${tg(pageName)}` : null, `🙋 ${reAssigneeName ? tg(reAssigneeName) : "กองกลาง"}`].filter(Boolean).join("\n"));
      }
    } else {
      // Lead still active — bump to top and count as new conversion
      await supabase.rpc("increment_lead_conversions", { p_lead_id: existingLead.id });
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
      await wlog(supabase, "leadgen_merged", {
        fb_page_id: fbPageId,
        leadgen_id,
        lead_id: existingLead.id,
        phone: rawPhone,
        name,
        detail: { reason: "duplicate_leadgen_id_active" },
      });
      const mergedParts = [
        `🔄 <b>ลีดส่งฟอร์มซ้ำ</b>`,
        `👤 ${tg(name ?? "ไม่ระบุชื่อ")}`,
        rawPhone ? `📞 ${tg(rawPhone)}` : null,
        campaignName ? `📢 ${tg(campaignName)}` : null,
        pageName ? `📄 ${tg(pageName)}` : null,
      ].filter(Boolean);
      void sendTelegram(mergedParts.join("\n"));
    }
    return true;
  }

  // Insert failed for unknown reason (not fb_id dup, not phone dup) — log it
  await wlog(supabase, "leadgen_error", {
    fb_page_id: fbPageId,
    leadgen_id,
    phone: rawPhone,
    name,
    detail: { reason: "insert_failed_unknown", pipeline_id: targetPipelineId },
  });

  // Not duplicate — find existing lead by phone and merge
  if (!rawPhone) return true;
  const { data: dups } = await supabase.rpc("find_lead_by_phone", {
    p_phone: rawPhone,
    p_pipeline_id: targetPipelineId,
  }) as {
    data: { id: string; customer_name: string }[] | null;
  };
  const existing = dups?.[0];
  if (!existing) return true;

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
  return true;
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

// Thai mobile number: 06x/08x/09x + optional separators + 7 digits
const PHONE_RE = /0[689]\d[\s\-.]*\d{3}[\s\-.]*\d{4}/;

async function autoTagCoupon(
  supabase: SupabaseClient,
  convId: string,
  text: string,
): Promise<void> {
  // Regex first — if no phone pattern, zero DB cost
  if (!PHONE_RE.test(text)) return;

  console.log("[autoTagCoupon] phone detected in conv", convId);

  // Check if conversation already has either coupon tag
  const COUPON_TAGS = ["รอส่งคูปอง", "ส่งคูปองแล้ว"];
  const { data: existing, error: existErr } = await supabase
    .from("conversation_tags")
    .select("tag_id, tags!inner(name)")
    .eq("conversation_id", convId);

  if (existErr) {
    console.error("[autoTagCoupon] check existing tags error:", existErr.message);
    return;
  }

  type TagRow = { tags: { name: string }[] };
  const hasCouponTag = (existing as unknown as TagRow[] | null)?.some((r) =>
    r.tags.some((t) => COUPON_TAGS.includes(t.name)),
  );
  if (hasCouponTag) {
    console.log("[autoTagCoupon] already has coupon tag, skipping");
    return;
  }

  // Fetch the tag id
  const { data: tag, error: tagErr } = await supabase
    .from("tags")
    .select("id")
    .eq("name", "รอส่งคูปอง")
    .single();

  if (tagErr || !tag) {
    console.error("[autoTagCoupon] tag not found:", tagErr?.message);
    return;
  }

  const { error: insertErr } = await supabase.from("conversation_tags").insert({
    conversation_id: convId,
    tag_id: tag.id,
  });

  if (insertErr) {
    console.error("[autoTagCoupon] insert error:", insertErr.message);
  } else {
    console.log("[autoTagCoupon] tagged conv", convId, "with รอส่งคูปอง");
  }
}

async function fetchPostInfo(
  postId: string,
  token: string,
): Promise<{ message?: string; story?: string; permalink_url?: string; full_picture?: string; created_time?: string } | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${postId}?fields=message,story,permalink_url,full_picture,created_time&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as { message?: string; story?: string; permalink_url?: string; full_picture?: string; created_time?: string };
  } catch {
    return null;
  }
}

async function sendAutoReply(
  supabase: SupabaseClient,
  conv: { id: string; created_at: string; last_message_at: string | null },
  pageId: string,
  senderPsid: string,
  pageToken: string,
  refAdId: string | null,
  isNewConversation: boolean,
): Promise<void> {
  try {
    const { data: setting } = await supabase
      .from("page_auto_reply")
      .select("*")
      .eq("page_id", pageId)
      .eq("is_active", true)
      .maybeSingle();

    if (!setting) return;

    // Check trigger conditions
    const isFromAd = !!refAdId && setting.trigger_from_ad;

    const isReturning = (() => {
      if (!setting.trigger_returning_days || !conv.last_message_at) return false;
      const daysSince = (Date.now() - new Date(conv.last_message_at).getTime()) / 86_400_000;
      return daysSince >= setting.trigger_returning_days;
    })();

    const shouldReply =
      (isNewConversation && setting.trigger_new_conv) || isFromAd || isReturning;

    if (!shouldReply) return;

    // Suppress only repeat auto-replies; a Sales reply must not block this greeting.
    // This is independent of the dashboards' 5-minute Sales response metric.
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conv.id)
      .eq("direction", "outbound")
      .eq("is_auto_reply", true)
      .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString());
    if ((count ?? 0) > 0) return;

    const apiBase = `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageToken)}`;

    let imageUrl = setting.image_url as string | null;
    if (setting.greeting_text?.trim() && imageUrl) {
      imageUrl = await ensureAutoReplyImage(supabase, {
        page_id: pageId, greeting_text: setting.greeting_text, image_url: imageUrl, updated_at: setting.updated_at,
      });
    }
    if (!imageUrl && !setting.greeting_text?.trim()) return;
    // Exactly one Send API call: the complete greeting and coupon share one image.
    const message = imageUrl
      ? { attachment: { type: "image", payload: { url: imageUrl } } }
      : { text: setting.greeting_text };
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: senderPsid }, messaging_type: "RESPONSE", message }),
    });
    if (!res.ok) {
      console.error("[sendAutoReply] send failed", await res.json().catch(() => ({})));
      return;
    }
    const json = await res.json().catch(() => ({})) as { message_id?: string };
    if (json.message_id) {
      const { error } = await supabase.from("messages").upsert({
        conversation_id: conv.id,
        direction: "outbound",
        content: setting.greeting_text || null,
        attachment_url: imageUrl,
        attachment_type: imageUrl ? "image" : null,
        fb_message_id: json.message_id,
        is_auto_reply: true,
      }, { onConflict: "fb_message_id" });
      // Reconcile an echo that arrived first: it must still be classified as auto-reply.
      if (error) console.error("[sendAutoReply] message save failed", error.message);
    }

    // Force direction back to "inbound" — FB echo may have arrived before our
    // is_auto_reply inserts and set direction to "outbound" (race condition).
    // Auto-reply must never count as "Sales replied".
    await supabase
      .from("conversations")
      .update({ last_message_direction: "inbound" })
      .eq("id", conv.id);

  } catch (e) {
    console.error("[sendAutoReply] error", e);
  }
}

const PUSH_DEBOUNCE_MS = 30_000; // 30 seconds between pushes per conversation

async function sendPushNotification(
  supabase: SupabaseClient,
  convId: string,
  senderName: string | null,
  text: string | null,
  attachmentType: string | null,
): Promise<void> {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL;
  if (!vapidPublic || !vapidPrivate || !vapidEmail) return;

  // Atomic debounce: only update + send if last_notified_at is old enough
  const debounceTs = new Date(Date.now() - PUSH_DEBOUNCE_MS).toISOString();
  const { data: updated } = await supabase
    .from("conversations")
    .update({ last_notified_at: new Date().toISOString() })
    .eq("id", convId)
    .or(`last_notified_at.is.null,last_notified_at.lt.${debounceTs}`)
    .select("id")
    .maybeSingle();

  if (!updated) return; // debounce: another push was sent recently

  // Count all unread conversations (global badge)
  const { count: unreadCount } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("last_message_direction", "inbound");

  // Fetch all push subscriptions
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key");

  if (!subs?.length) return;

  webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);

  const bodyPreview = text
    ? (text.length > 80 ? text.slice(0, 80) + "…" : text)
    : attachmentType === "image" ? "[รูปภาพ]" : "[ไฟล์]";

  const payload = JSON.stringify({
    title: senderName ?? "ข้อความใหม่",
    body: bodyPreview,
    convId,
    badge: unreadCount ?? 0,
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload,
        );
      } catch (err: unknown) {
        const status = (err && typeof err === "object" && "statusCode" in err) ? (err as { statusCode: number }).statusCode : null;
        if (status === 410) {
          // Subscription expired — remove it
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          console.error("[push] sendNotification failed", { status, endpoint: sub.endpoint.slice(0, 60), err });
        }
      }
    }),
  );
}

async function enrichSenderName(
  supabase: SupabaseClient,
  convId: string,
  psid: string,
  token: string,
  fbPageId: string,
): Promise<string | null> {
  try {
    // Use Conversations API — direct /{psid}?fields=name is no longer supported
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${fbPageId}/conversations?user_id=${psid}&fields=participants&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as unknown;
      console.error("[enrichSenderName] Conversations API error psid=%s body=%s", psid, JSON.stringify(errBody));
      return null;
    }
    type ConvApiResult = { data?: { participants?: { data?: { name?: string; id?: string }[] } }[] };
    const data = (await res.json()) as ConvApiResult;
    const participants = data.data?.[0]?.participants?.data ?? [];
    const user = participants.find((p) => p.id !== fbPageId);
    if (user?.name) {
      let pictureUrl: string | null = null;
      try {
        const picRes = await fetch(
          `https://graph.facebook.com/v20.0/${psid}?fields=profile_pic&access_token=${encodeURIComponent(token)}`,
        );
        const picData = (await picRes.json().catch(() => ({}))) as { profile_pic?: string };
        pictureUrl = picData.profile_pic ?? null;
      } catch {
        pictureUrl = null;
      }
      await supabase
        .from("conversations")
        .update({ sender_name: user.name, ...(pictureUrl ? { picture_url: pictureUrl } : {}) })
        .eq("id", convId);
      return user.name;
    }
    return null;
  } catch (e) {
    console.error("[enrichSenderName] fetch error psid=%s", psid, e);
    return null;
  }
}
