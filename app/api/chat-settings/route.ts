import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id");
  if (!pageId) return NextResponse.json({ error: "Missing page_id" }, { status: 400 });

  const supabase = adminSupabase();
  const { data, error } = await supabase
    .from("page_auto_reply")
    .select("*")
    .eq("page_id", pageId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    page_id: string;
    is_active: boolean;
    greeting_text: string | null;
    image_url: string | null;
    trigger_new_conv: boolean;
    trigger_from_ad: boolean;
    trigger_returning_days: number | null;
    created_by: string;
  };

  if (!body.page_id) return NextResponse.json({ error: "Missing page_id" }, { status: 400 });

  const supabase = adminSupabase();
  const { data, error } = await supabase
    .from("page_auto_reply")
    .upsert(
      {
        page_id: body.page_id,
        is_active: body.is_active,
        greeting_text: body.greeting_text || null,
        image_url: body.image_url || null,
        trigger_new_conv: body.trigger_new_conv,
        trigger_from_ad: body.trigger_from_ad,
        trigger_returning_days: body.trigger_returning_days ?? null,
        created_by: body.created_by,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "page_id" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
