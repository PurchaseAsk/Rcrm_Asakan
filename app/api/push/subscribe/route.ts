import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// POST — save subscription for current user
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { userId: string; subscription: PushSub };
  if (!body.userId || !body.subscription?.endpoint) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = adminSupabase();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: body.userId,
      endpoint: body.subscription.endpoint,
      p256dh: body.subscription.keys.p256dh,
      auth_key: body.subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove subscription (on logout or permission revoked)
export async function DELETE(req: NextRequest) {
  const { endpoint } = (await req.json()) as { endpoint: string };
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  const supabase = adminSupabase();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
