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
  return phone.replace(/\D/g, "");
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
    .select("phone, email, customer_name, page_id, facebook_pages(pixel_id, capi_token)")
    .eq("id", lead_id)
    .single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  type PageRow = { pixel_id: string | null; capi_token: string | null };
  const page = (lead as unknown as { facebook_pages: PageRow }).facebook_pages;

  if (!page?.pixel_id || !page?.capi_token) {
    return NextResponse.json({ ok: true, skipped: true, reason: "No pixel/token configured for this page" });
  }

  const userData: Record<string, string[]> = {};
  const phone = (lead as unknown as { phone: string | null }).phone;
  const email = (lead as unknown as { email: string | null }).email;

  if (phone) userData.ph = [sha256(normalizePhone(phone))];
  if (email) userData.em = [sha256(email)];

  const payload = {
    data: [
      {
        event_name: stage.capi_event,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "crm",
        user_data: userData,
        custom_data: {
          lead_id,
        },
      },
    ],
  };

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${page.pixel_id}/events?access_token=${encodeURIComponent(page.capi_token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    return NextResponse.json({ error: err.error?.message ?? "CAPI error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: stage.capi_event });
}
