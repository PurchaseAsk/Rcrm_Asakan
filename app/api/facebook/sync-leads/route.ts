import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegram, tg } from "@/lib/telegram";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type FbLeadField = { name: string; values: string[] };
type FbLead = {
  id: string;
  field_data?: FbLeadField[];
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
};
type FbForm = { id: string; name?: string };

export async function POST(request: NextRequest) {
  let body: { page_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  const { page_id } = body;
  if (!page_id) return NextResponse.json({ error: "Missing page_id" }, { status: 400 });

  const supabase = adminSupabase();

  const { data: page } = await supabase
    .from("facebook_pages")
    .select("id, name, page_id, token")
    .eq("id", page_id)
    .single();

  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const fbPageId = page.page_id as string;
  const token = (page as Record<string, unknown>).token as string | null;

  if (!token) {
    return NextResponse.json({ error: "No page token configured" }, { status: 400 });
  }

  // Collect all existing facebook_lead_ids for this page to skip duplicates
  const { data: existingRows } = await supabase
    .from("leads")
    .select("facebook_lead_id")
    .eq("page_id", page_id)
    .not("facebook_lead_id", "is", null);

  const existingFbLeadIds = new Set<string>(
    (existingRows ?? []).map((r) => r.facebook_lead_id as string),
  );

  // Get distribution rule so new leads land in the right pipeline
  const { data: distRule } = await supabase
    .from("distribution_rules")
    .select("pipeline_id")
    .eq("page_id", page_id)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const targetPipelineId: string | null = distRule?.pipeline_id ?? null;

  let created = 0;
  let merged = 0;
  let skipped = 0;
  let errors = 0;

  // Step 1: fetch all leadgen forms for this page
  const formsUrl = `https://graph.facebook.com/v20.0/${fbPageId}/leadgen_forms?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`;
  const formsRes = await fetch(formsUrl);
  if (!formsRes.ok) {
    const errBody = (await formsRes.json().catch(() => ({}))) as unknown;
    console.error("[sync-leads] failed to fetch forms", errBody);
    return NextResponse.json({ error: "Failed to fetch leadgen forms", detail: errBody }, { status: 502 });
  }

  const formsData = (await formsRes.json()) as { data?: FbForm[] };
  const forms = formsData.data ?? [];

  // Step 2: for each form, paginate through all leads
  for (const form of forms) {
    let nextUrl: string | null =
      `https://graph.facebook.com/v20.0/${form.id}/leads?fields=id,field_data,ad_id,adset_id,campaign_id&limit=100&access_token=${encodeURIComponent(token)}`;

    while (nextUrl) {
      const leadsRes = await fetch(nextUrl);
      if (!leadsRes.ok) {
        const errBody = (await leadsRes.json().catch(() => ({}))) as unknown;
        console.error("[sync-leads] failed to fetch leads for form", form.id, errBody);
        errors++;
        break;
      }

      const leadsData = (await leadsRes.json()) as { data?: FbLead[]; paging?: { next?: string } };
      const fbLeads = leadsData.data ?? [];
      nextUrl = leadsData.paging?.next ?? null;

      for (const fbLead of fbLeads) {
        const leadgenId = fbLead.id;

        // Already in system by facebook_lead_id
        if (existingFbLeadIds.has(leadgenId)) {
          skipped++;
          continue;
        }

        const fields = fbLead.field_data ?? [];
        const get = (fname: string) => fields.find((f) => f.name === fname)?.values[0] ?? null;

        const rawPhone = get("phone_number") ?? get("phone");
        const name = get("full_name") ?? get("name") ?? get("first_name");
        const email = get("email");

        // Phone dedupe — merge into existing lead if same phone in same pipeline
        if (rawPhone) {
          const { data: dups } = (await supabase.rpc("find_lead_by_phone", {
            p_phone: rawPhone,
            p_pipeline_id: targetPipelineId,
          })) as { data: { id: string; customer_name: string }[] | null };

          if (dups?.[0]) {
            await supabase
              .from("leads")
              .update({
                last_activity_at: new Date().toISOString(),
                ...(email ? { email } : {}),
              })
              .eq("id", dups[0].id);
            await supabase.from("lead_activities").insert({
              lead_id: dups[0].id,
              type: "note",
              content: `Facebook Lead Form (sync ย้อนหลัง) — เบอร์ซ้ำกับลีดเดิม${form.name ? ` · ฟอร์ม: ${form.name}` : ""}`,
              created_by: null,
            });
            await supabase.rpc("increment_lead_conversions", { p_lead_id: dups[0].id });
            existingFbLeadIds.add(leadgenId);
            merged++;
            continue;
          }
        }

        // Create new lead
        const metadata: Record<string, string> = {};
        if (fbLead.ad_id) metadata.ad_id = fbLead.ad_id;
        if (fbLead.adset_id) metadata.adset_id = fbLead.adset_id;
        if (fbLead.campaign_id) metadata.campaign_id = fbLead.campaign_id;
        if (form.id) metadata.form_id = form.id;
        if (form.name) metadata.form_name = form.name;

        const { data: newLead } = await supabase
          .from("leads")
          .insert({
            customer_name: name ?? "Facebook Lead",
            phone: rawPhone ?? null,
            email: email ?? null,
            page_id: page_id,
            pipeline_id: targetPipelineId,
            source: "facebook",
            status: "active",
            facebook_lead_id: leadgenId,
            metadata: Object.keys(metadata).length ? metadata : null,
            last_activity_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (newLead) {
          existingFbLeadIds.add(leadgenId);
          await supabase.from("lead_activities").insert({
            lead_id: newLead.id,
            type: "created",
            content: `สร้างลีดจาก Facebook Lead Form (sync ย้อนหลัง)${form.name ? ` · ฟอร์ม: ${form.name}` : ""}`,
            created_by: null,
          });
          await supabase.rpc("distribute_lead", { p_lead_id: newLead.id });
          created++;
        } else {
          console.error("[sync-leads] insert failed for leadgen_id", leadgenId);
          errors++;
        }
      }
    }
  }

  if (created > 0 || merged > 0) {
    const lines = [
      `🔄 <b>Sync ลีดจาก Facebook</b>`,
      `📄 ${tg(page.name as string)}`,
      created > 0 ? `✅ สร้างใหม่: ${created} ลีด` : null,
      merged > 0 ? `🔗 รวมซ้ำ: ${merged} ลีด` : null,
      skipped > 0 ? `⏭️ มีอยู่แล้ว: ${skipped} ลีด` : null,
    ].filter(Boolean);
    void sendTelegram(lines.join("\n"));
  }

  return NextResponse.json({ created, merged, skipped, errors, forms: forms.length });
}
