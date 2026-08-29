import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Convert local Thai format 0XXXXXXXXX → 66XXXXXXXXX (E.164 without +)
  if (digits.startsWith("0") && digits.length === 10) {
    return "66" + digits.slice(1);
  }
  return digits;
}

export async function POST(request: NextRequest) {
  let body: { lead_id?: string; stage_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  const { lead_id, stage_id } = body;
  if (!lead_id || !stage_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = adminSupabase();

  // Fetch stage capi_event
  const { data: stage } = await supabase
    .from("funnel_stages")
    .select("capi_event")
    .eq("id", stage_id)
    .single();

  if (!stage?.capi_event) return NextResponse.json({ ok: true, skipped: true });

  // Fetch lead + page pixel config
  const { data: lead } = await supabase
    .from("leads")
    .select("phone, email, customer_name, facebook_id, facebook_lead_id, page_id, facebook_pages(pixel_id, capi_token)")
    .eq("id", lead_id)
    .single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  type PageRow = { pixel_id: string | null; capi_token: string | null };
  const page = (lead as unknown as { facebook_pages: PageRow }).facebook_pages;

  if (!page?.pixel_id || !page?.capi_token) {
    return NextResponse.json({ ok: true, skipped: true, reason: "No pixel/token configured for this page" });
  }

  const leadData = lead as unknown as {
    phone: string | null;
    email: string | null;
    customer_name: string | null;
    facebook_id: string | null;
    facebook_lead_id: string | null;
  };

  const userData: Record<string, unknown> = {};

  if (leadData.phone) userData.ph = [sha256(normalizePhone(leadData.phone))];
  if (leadData.email) userData.em = [sha256(leadData.email.trim().toLowerCase())];
  // external_id: always include internal lead_id; also include PSID if available
  const extIds = [sha256(lead_id)];
  if (leadData.facebook_id) extIds.push(sha256(leadData.facebook_id));
  userData.external_id = extIds;
  // Facebook Lead Ad ID — strongest EMQ signal for lead ads, sent plain (not hashed)
  if (leadData.facebook_lead_id) userData.lead_id = leadData.facebook_lead_id;
  // First name from customer_name
  if (leadData.customer_name) {
    const nameParts = leadData.customer_name.trim().split(/\s+/);
    userData.fn = [sha256(nameParts[0])];
    if (nameParts.length > 1) userData.ln = [sha256(nameParts.slice(1).join(" "))];
  }

  const eventTime = Math.floor(Date.now() / 1000);
  // Deterministic event_id (no timestamp) so retries don't create duplicate events
  const eventId = `${lead_id}-${stage_id}`;
  // Set TEST_CAPI_EVENT_CODE env var to route events to FB Test Events tab
  const testEventCode = process.env.TEST_CAPI_EVENT_CODE;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: stage.capi_event,
        event_time: eventTime,
        event_id: eventId,
        action_source: "system_generated",
        user_data: userData,
        custom_data: { crm_lead_id: lead_id },
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${page.pixel_id}/events?access_token=${encodeURIComponent(page.capi_token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const fbBody = (await res.json()) as { events_received?: number; error?: { message?: string; code?: number } };
  console.log("[capi] fb response", JSON.stringify(fbBody));

  if (!res.ok || fbBody.error) {
    const msg = fbBody.error?.message ?? "CAPI error";
    console.error("[capi] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: stage.capi_event, events_received: fbBody.events_received });
}
