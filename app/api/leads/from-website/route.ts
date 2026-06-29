import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";

interface WebsiteLeadPayload {
  secret: string;
  project_slug: string;
  name: string;
  phone?: string;
  email?: string;
  message?: string;
  appointment_date?: string;
  source_url?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as WebsiteLeadPayload;
  const { secret, project_slug, name, phone, email, message, appointment_date, source_url } = body;

  if (!secret || !project_slug || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify secret
  const { data: settings } = await supabase
    .from("website_settings")
    .select("webhook_secret")
    .single();

  if (!settings || settings.webhook_secret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find matching active rule for this project_slug
  const { data: rule } = await supabase
    .from("website_lead_rules")
    .select("pipeline_id, stage_id, assigned_to, facebook_page_id")
    .eq("project_slug", project_slug)
    .eq("is_active", true)
    .maybeSingle();

  // Build metadata
  const metadata: Record<string, string> = {};
  if (message) metadata.message = message;
  if (appointment_date) metadata.appointment_date = appointment_date;
  if (source_url) metadata.source_url = source_url;
  metadata.source = "website";
  metadata.project_slug = project_slug;

  const activityContent = `📥 ลงทะเบียนจากเว็บไซต์ โปรเจกต์: ${project_slug}${message ? `\nข้อความ: ${message}` : ""}${appointment_date ? `\nนัดหมาย: ${appointment_date}` : ""}`;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      customer_name: name,
      phone: phone ?? null,
      email: email ?? null,
      page_id: rule?.facebook_page_id ?? null,
      pipeline_id: rule?.pipeline_id ?? null,
      stage_id: rule?.stage_id ?? null,
      stage_entered_at: rule?.stage_id ? new Date().toISOString() : null,
      assigned_to: rule?.assigned_to ?? null,
      source: "website",
      metadata,
    })
    .select("id")
    .single();

  // Duplicate phone — find existing lead and log activity instead
  if (error?.code === "23505" && phone) {
    const { data: dups } = await supabase.rpc("find_lead_by_phone", {
      p_phone: phone,
      p_pipeline_id: rule?.pipeline_id ?? null,
    }) as { data: { id: string }[] | null };
    const existingId = dups?.[0]?.id;
    if (existingId) {
      await Promise.all([
        supabase.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", existingId),
        supabase.from("lead_activities").insert({
          lead_id: existingId,
          type: "note",
          content: activityContent,
          created_by: null,
        }),
      ]);
      const dupParts = [
        `🌐 <b>ลีดซ้ำ (เว็บไซต์)</b>`,
        `👤 ${name}`,
        phone ? `📞 ${phone}` : null,
        email ? `📧 ${email}` : null,
        message ? `💬 ${message}` : null,
        `📂 ${project_slug}`,
      ].filter(Boolean);
      void sendTelegram(dupParts.join("\n"));
      return NextResponse.json({ ok: true, lead_id: existingId, duplicate: true });
    }
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (error || !lead) {
    console.error("[from-website] insert error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }

  await supabase.from("lead_activities").insert({
    lead_id: lead.id,
    type: "note",
    content: activityContent,
    created_by: null,
  });

  // If a virtual facebook_page is mapped, run distribution so round-robin works
  if (rule?.facebook_page_id) {
    await supabase.rpc("distribute_lead", { p_lead_id: lead.id });
  }

  const parts = [
    `🌐 <b>ลีดใหม่ (เว็บไซต์)</b>`,
    `👤 ${name}`,
    phone ? `📞 ${phone}` : null,
    email ? `📧 ${email}` : null,
    message ? `💬 ${message}` : null,
    appointment_date ? `📅 นัด: ${appointment_date}` : null,
    `📂 ${project_slug}`,
  ].filter(Boolean);
  void sendTelegram(parts.join("\n"));

  return NextResponse.json({ ok: true, lead_id: lead.id });
}
