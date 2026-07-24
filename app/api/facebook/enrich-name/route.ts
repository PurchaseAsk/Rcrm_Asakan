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

  console.log("[enrich-name] conv_id=%s name=%s pic=%s", conv_id, row.sender_name ?? "null", row.picture_url ? row.picture_url.slice(0, 60) : "null");
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
  let pictureUrl: string | null = row.picture_url;

  if (!nameToSave || !pictureUrl) {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${fbPageId}/conversations?user_id=${row.sender_psid}&fields=participants{name,id,picture.redirect(false){url}}&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) {
      const err = (await res.json()) as unknown;
      console.error("[enrich-name] Conversations API error psid=%s:", row.sender_psid, JSON.stringify(err));
      return NextResponse.json({ error: "Graph API error" }, { status: 500 });
    }
    type ConvApiResult = { data?: { participants?: { data?: { name?: string; id?: string; picture?: unknown }[] } }[] };
    const data = (await res.json()) as ConvApiResult;
    const participants = data.data?.[0]?.participants?.data ?? [];
    const user = participants.find((p) => p.id !== fbPageId);
    console.log("[enrich-name] participant user raw:", JSON.stringify(user));
    nameToSave = nameToSave ?? user?.name ?? null;
    const pic = user?.picture as { data?: { url?: string } } | string | undefined;
    pictureUrl = pictureUrl ?? (typeof pic === "string" ? pic : pic?.data?.url) ?? null;
  }

  // Fallback: fetch picture via /{psid}/picture if still missing
  if (nameToSave && !pictureUrl) {
    try {
      const picRes = await fetch(
        `https://graph.facebook.com/v20.0/${row.sender_psid}/picture?redirect=false&type=large&access_token=${encodeURIComponent(token)}`,
      );
      const picRaw = (await picRes.json()) as unknown;
      console.log("[enrich-name] picture fallback raw:", JSON.stringify(picRaw));
      if (picRes.ok) {
        const picData = picRaw as { data?: { url?: string; is_silhouette?: boolean } };
        if (picData.data?.url && !picData.data.is_silhouette) {
          pictureUrl = picData.data.url;
        }
      }
    } catch (e) { console.error("[enrich-name] picture fallback error:", e); }
  }

  if (nameToSave) {
    await supabase.from("conversations").update({ sender_name: nameToSave, picture_url: pictureUrl }).eq("id", conv_id);
    return NextResponse.json({ name: nameToSave, picture_url: pictureUrl });
  }

  return NextResponse.json({ name: null, picture_url: null });
}
