import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

export async function POST() {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL;
  if (!vapidPublic || !vapidPrivate || !vapidEmail) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth_key");
  if (!subs?.length) return NextResponse.json({ error: "No subscriptions" }, { status: 404 });

  webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);

  const payload = JSON.stringify({ title: "🔔 Test Push", body: "ระบบแจ้งเตือนทำงานแล้ว!", convId: null, badge: 1 });

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        return { endpoint: sub.endpoint.slice(0, 40), status: "ok" };
      } catch (err: unknown) {
        const status = (err && typeof err === "object" && "statusCode" in err) ? (err as { statusCode: number }).statusCode : null;
        console.error("[push-test] failed", { status, endpoint: sub.endpoint.slice(0, 40) });
        return { endpoint: sub.endpoint.slice(0, 40), status: `error-${status}` };
      }
    }),
  );

  return NextResponse.json({ results: results.map((r) => r.status === "fulfilled" ? r.value : r.reason) });
}
