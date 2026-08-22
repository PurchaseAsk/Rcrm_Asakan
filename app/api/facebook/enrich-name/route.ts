import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { conv_id } = (await request.json()) as { conv_id: string };
  if (!conv_id) return NextResponse.json({ error: "Missing conv_id" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: conv } = await supabase
    .from("conversations")
    .select("sender_psid, sender_name, picture_url, facebook_pages!inner(page_id, token)")
    .eq("id", conv_id)
    .single();

  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  type ConvRow = { sender_psid: string; sender_name: string | null; picture_url: string | null; facebook_pages: { page_id: string; token: string | null } };
  const row = conv as unknown as ConvRow;

  // Already have both name and picture — nothing to do
  if (row.sender_name && row.picture_url) {
    return NextResponse.json({ name: row.sender_name, picture_url: row.picture_url });
  }

  const fbPageId = row.facebook_pages?.page_id;
  const dbToken = row.facebook_pages?.token ?? null;
  const envToken = (process.env[`FB_MSG_TOKEN_${fbPageId}`] ?? process.env[`FB_PAGE_TOKEN_${fbPageId}`]) as string | undefined;
  const token = envToken ?? dbToken ?? null;

  if (!token) {
    console.error("[enrich-name] No token for page", fbPageId, "dbToken=", dbToken ? "SET" : "NULL");
    return NextResponse.json({ error: "No page token" }, { status: 400 });
  }

  let nameToSave = row.sender_name;

  // Fetch name if missing
  if (!nameToSave) {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${fbPageId}/conversations?user_id=${row.sender_psid}&fields=participants{name,id}&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) {
      const err = (await res.json()) as { error?: { code?: number } };
      if (err.error?.code === 4) {
        console.warn("[enrich-name] rate limited by Facebook, skipping psid=%s", row.sender_psid);
        return NextResponse.json({ name: null, picture_url: null, rate_limited: true });
      }
      console.error("[enrich-name] Conversations API error psid=%s:", row.sender_psid, JSON.stringify(err));
      return NextResponse.json({ error: "Graph API error" }, { status: 500 });
    }
    type ConvApiResult = { data?: { participants?: { data?: { name?: string; id?: string }[] } }[] };
    const data = (await res.json()) as ConvApiResult;
    const participants = data.data?.[0]?.participants?.data ?? [];
    const user = participants.find((p) => p.id !== fbPageId);
    nameToSave = user?.name ?? null;
  }

  // Fetch picture if missing
  let pictureUrl = row.picture_url;
  if (!pictureUrl) {
    try {
      const picRes = await fetch(
        `https://graph.facebook.com/v20.0/${row.sender_psid}?fields=profile_pic&access_token=${encodeURIComponent(token)}`,
      );
      if (picRes.ok) {
        const picData = (await picRes.json()) as { profile_pic?: string };
        if (picData.profile_pic) pictureUrl = picData.profile_pic;
      }
    } catch {
      // ignore — picture is optional
    }
  }

  // Persist whatever changed
  const updates: Record<string, string> = {};
  if (nameToSave && !row.sender_name) updates.sender_name = nameToSave;
  if (pictureUrl && !row.picture_url) updates.picture_url = pictureUrl;
  if (Object.keys(updates).length > 0) {
    await supabase.from("conversations").update(updates).eq("id", conv_id);
  }

  return NextResponse.json({ name: nameToSave, picture_url: pictureUrl });
}
