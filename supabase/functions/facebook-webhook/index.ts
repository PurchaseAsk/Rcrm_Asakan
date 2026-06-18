import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === Deno.env.get("FB_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }

    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { headers: corsHeaders, status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const body = await req.json();

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;

        const leadgenId = change.value.leadgen_id;
        const pageId = change.value.page_id;
        const formId = change.value.form_id;

        const { data: page } = await supabase
          .from("facebook_pages")
          .select("id")
          .eq("page_id", pageId)
          .single();

        if (!page) continue;

        // TODO: Fetch real lead fields from Facebook Graph API with a page token.
        const leadData = {
          name: "Lead from Facebook",
          phone: "",
          email: "",
        };

        const { data: stage } = await supabase
          .from("funnel_stages")
          .select("id")
          .eq("is_unfollow", false)
          .is("pipeline_id", null)
          .order("position", { ascending: true })
          .limit(1)
          .single();

        const { data: newLead, error } = await supabase
          .from("leads")
          .insert({
            customer_name: leadData.name,
            phone: leadData.phone,
            email: leadData.email,
            page_id: page.id,
            stage_id: stage?.id,
            status: "active",
            source: "facebook",
            metadata: { leadgen_id: leadgenId, form_id: formId, page_id: pageId },
          })
          .select()
          .single();

        if (error) throw error;

        await supabase.rpc("distribute_lead", { p_lead_id: newLead.id });
        await supabase.from("lead_activities").insert({
          lead_id: newLead.id,
          type: "note",
          content: `Received lead from Facebook Page ID: ${pageId}`,
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
