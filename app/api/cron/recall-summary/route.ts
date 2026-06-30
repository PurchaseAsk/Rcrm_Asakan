import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegram, tg } from "@/lib/telegram";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Count last 24 hours so the daily 08:00 Thailand cron always covers a full day
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: activities, error } = await supabase
    .from("lead_activities")
    .select("content")
    .eq("type", "recalled")
    .gte("created_at", since.toISOString());

  if (error) {
    console.error("[recall-summary] query error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!activities || activities.length === 0) {
    await sendTelegram(`📊 <b>สรุป Recall วันนี้</b>\n✅ ไม่มีลีดถูกดึงกลับวันนี้`);
    return NextResponse.json({ ok: true, recalled: 0 });
  }

  // Parse "🔄 ดึงลีดกลับเข้าส่วนกลางจาก <name> หลังอยู่ใน stage ..."
  const counts = new Map<string, number>();
  for (const { content } of activities) {
    const match = content?.match(/ดึงลีดกลับเข้าส่วนกลางจาก (.+?) หลังอยู่ใน stage/);
    const name = match?.[1] ?? "ไม่ระบุ";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const total = activities.length;
  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `• ${tg(name)}: ${count} lead${count > 1 ? "s" : ""}`);

  const text = [
    `📊 <b>สรุป Recall วันนี้ (${total} leads)</b>`,
    ...lines,
  ].join("\n");

  await sendTelegram(text);

  return NextResponse.json({ ok: true, recalled: total });
}
