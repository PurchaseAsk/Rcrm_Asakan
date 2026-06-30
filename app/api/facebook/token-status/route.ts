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
  const { data: page } = await supabase
    .from("facebook_pages")
    .select("token, pixel_id, capi_token")
    .eq("id", pageId)
    .single();

  const result: Record<string, unknown> = { token: "none", pixel: "none" };

  // Check Page Token
  if (page?.token) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${encodeURIComponent(page.token)}`,
      );
      result.token = res.ok ? "valid" : "invalid";
    } catch {
      result.token = "invalid";
    }
  }

  // CAPI token: just check presence — dataset tokens don't have GET permission on pixel object
  if (page?.pixel_id && page?.capi_token) {
    result.pixel = "valid";
  }

  return NextResponse.json(result);
}
