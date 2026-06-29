import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function graphPost(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`https://graph.facebook.com/v20.0/${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as { message?: string })?.message ?? "Graph API error");
  return data;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    comment_id: string;
    action: "reply" | "private_reply" | "archive";
    message?: string;
    user_id?: string;
  };
  const { comment_id, action, message, user_id } = body;
  if (!comment_id || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = adminSupabase();

  // Load comment + page token
  const { data: comment } = await supabase
    .from("page_comments")
    .select("*, page:facebook_pages(id, page_id, token)")
    .eq("id", comment_id)
    .single();

  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  const page = comment.page as { id: string; page_id: string; token: string | null } | null;
  const pageId = page?.page_id ?? "";
  const token =
    (process.env[`FB_MSG_TOKEN_${pageId}`] as string | undefined) ?? page?.token ?? null;

  if (action === "reply") {
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });
    if (!token) return NextResponse.json({ error: "No page token" }, { status: 500 });
    const result = await graphPost(
      `${comment.fb_comment_id}/comments`,
      { message: message.trim() },
      token,
    );
    await supabase.from("page_comment_replies").insert({
      comment_id,
      message: message.trim(),
      fb_reply_id: (result.id as string) ?? null,
      created_by: user_id ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "private_reply") {
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });
    if (!token) return NextResponse.json({ error: "No page token" }, { status: 500 });
    await graphPost(
      `${comment.fb_comment_id}/private_replies`,
      { message: message.trim() },
      token,
    );
    await supabase.from("page_comments").update({ private_reply_sent: true }).eq("id", comment_id);
    return NextResponse.json({ ok: true });
  }

  if (action === "archive") {
    const reason = (comment.private_reply_sent as boolean) ? "chat" : "done";
    await supabase
      .from("page_comments")
      .update({ status: "archived", archive_reason: reason })
      .eq("id", comment_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
