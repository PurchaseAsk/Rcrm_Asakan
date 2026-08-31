import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function pushLineGroup(messages: unknown[]): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;
  if (!token || !groupId) {
    console.error("[daily-summary] LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID not set");
    return;
  }
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: groupId, messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[daily-summary] LINE push error", JSON.stringify(err));
  }
}

// --- Flex helpers ---
function fText(
  text: string,
  {
    bold = false,
    color = "#333333",
    size = "sm",
    wrap = false,
    align = "start",
  }: { bold?: boolean; color?: string; size?: string; wrap?: boolean; align?: string } = {},
): object {
  return { type: "text", text, size, color, weight: bold ? "bold" : "regular", wrap, align };
}

function fSep(): object {
  return { type: "separator", margin: "lg", color: "#e2e8f0" };
}

function fSectionTitle(text: string): object {
  return fText(text, { bold: true, color: "#1e40af", size: "sm" });
}

function fStatRow(label: string, value: string | number): object {
  return {
    type: "box",
    layout: "horizontal",
    margin: "xs",
    contents: [
      fText(label, { color: "#6b7280", size: "sm" }),
      fText(String(value), { bold: true, color: "#111827", size: "sm", align: "end" }),
    ],
  };
}

function fPersonRow(name: string, detail: string): object {
  return {
    type: "box",
    layout: "horizontal",
    margin: "xs",
    contents: [
      fText(`• ${name}`, { color: "#374151", size: "sm" }),
      fText(detail, { color: "#111827", size: "sm", bold: true, align: "end" }),
    ],
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = adminSupabase();

  // Today range in Thai time (UTC+7)
  const offsetMs = 7 * 60 * 60 * 1000;
  const nowThai = new Date(Date.now() + offsetMs);
  const todayStart = new Date(
    Date.UTC(nowThai.getUTCFullYear(), nowThai.getUTCMonth(), nowThai.getUTCDate()) - offsetMs,
  );
  const since = todayStart.toISOString();
  const dateLabel = todayStart.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });

  const [
    recallRes,
    activityRes,
    totalLeadsRes,
    unfollowRes,
    fbConvRes,
    lineConvRes,
    fbInboundRes,
    fbOutboundRes,
    lineInboundRes,
    lineOutboundRes,
  ] = await Promise.all([
    // Recalls today
    supabase.from("lead_activities").select("content").eq("type", "recalled").gte("created_at", since),
    // Activities today by staff
    supabase
      .from("lead_activities")
      .select("type, created_by, profiles(full_name, email)")
      .in("type", ["note", "stage_change"])
      .gte("created_at", since)
      .not("created_by", "is", null),
    // Total leads today
    supabase.from("leads").select("id, source").gte("created_at", since),
    // Unfollowed today (stage_change activity mentioning เลิกติดตาม)
    supabase
      .from("lead_activities")
      .select("id")
      .eq("type", "stage_change")
      .gte("created_at", since)
      .ilike("content", "%เลิกติดตาม%"),
    // Facebook conversations active today
    supabase.from("conversations").select("id, lead_id").gte("last_message_at", since),
    // LINE OA conversations active today
    supabase.from("line_conversations").select("id, lead_id").gte("last_message_at", since),
    // Facebook: first inbound per conversation today
    supabase
      .from("messages")
      .select("conversation_id, created_at")
      .eq("direction", "inbound")
      .gte("created_at", since)
      .order("created_at"),
    // Facebook: first outbound per conversation today
    supabase
      .from("messages")
      .select("conversation_id, created_at")
      .eq("direction", "outbound")
      .gte("created_at", since)
      .order("created_at"),
    // LINE: first inbound per conversation today
    supabase
      .from("line_messages")
      .select("conversation_id, created_at")
      .eq("direction", "inbound")
      .gte("created_at", since)
      .order("created_at"),
    // LINE: first outbound per conversation today
    supabase
      .from("line_messages")
      .select("conversation_id, created_at")
      .eq("direction", "outbound")
      .gte("created_at", since)
      .order("created_at"),
  ]);

  // --- Recall by person ---
  const recallMap = new Map<string, number>();
  for (const { content } of recallRes.data ?? []) {
    const match = content?.match(/ดึงลีดกลับเข้าส่วนกลางจาก (.+?) หลังอยู่ใน stage/);
    const name = match?.[1] ?? "ไม่ระบุ";
    recallMap.set(name, (recallMap.get(name) ?? 0) + 1);
  }
  const totalRecall = recallRes.data?.length ?? 0;

  // --- Activities by person ---
  type ActRow = { type: string; profiles: { full_name: string | null; email: string } | null };
  const actMap = new Map<string, { note: number; stage: number }>();
  for (const r of (activityRes.data ?? []) as unknown as ActRow[]) {
    const name = r.profiles?.full_name ?? r.profiles?.email ?? "ไม่ระบุ";
    const cur = actMap.get(name) ?? { note: 0, stage: 0 };
    if (r.type === "note") cur.note++;
    else cur.stage++;
    actMap.set(name, cur);
  }

  // --- Lead totals ---
  const totalLeads = totalLeadsRes.data?.length ?? 0;
  const totalUnfollow = unfollowRes.data?.length ?? 0;

  // --- Chat metrics (same logic as Dashboard Chat Metrics tab) ---
  // Build firstIn / firstOut maps for Facebook
  const fbFirstIn = new Map<string, string>();
  for (const m of (fbInboundRes.data ?? []) as { conversation_id: string; created_at: string }[]) {
    if (!fbFirstIn.has(m.conversation_id)) fbFirstIn.set(m.conversation_id, m.created_at);
  }
  const fbFirstOut = new Map<string, string>();
  for (const m of (fbOutboundRes.data ?? []) as { conversation_id: string; created_at: string }[]) {
    if (!fbFirstOut.has(m.conversation_id)) fbFirstOut.set(m.conversation_id, m.created_at);
  }

  // Build firstIn / firstOut maps for LINE OA
  const lineFirstIn = new Map<string, string>();
  for (const m of (lineInboundRes.data ?? []) as { conversation_id: string; created_at: string }[]) {
    if (!lineFirstIn.has(m.conversation_id)) lineFirstIn.set(m.conversation_id, m.created_at);
  }
  const lineFirstOut = new Map<string, string>();
  for (const m of (lineOutboundRes.data ?? []) as { conversation_id: string; created_at: string }[]) {
    if (!lineFirstOut.has(m.conversation_id)) lineFirstOut.set(m.conversation_id, m.created_at);
  }

  function calcResponseStats(
    firstInMap: Map<string, string>,
    firstOutMap: Map<string, string>,
  ): { fast5: number; slow5: number } {
    let fast5 = 0;
    let withReply = 0;
    for (const [convId, firstIn] of firstInMap) {
      const firstOut = firstOutMap.get(convId);
      if (!firstOut) continue;
      withReply++;
      const diffMs = new Date(firstOut).getTime() - new Date(firstIn).getTime();
      if (diffMs >= 0 && diffMs <= 5 * 60 * 1000) fast5++;
    }
    return { fast5, slow5: withReply - fast5 };
  }

  const fbStats = calcResponseStats(fbFirstIn, fbFirstOut);
  const lineStats = calcResponseStats(lineFirstIn, lineFirstOut);

  const totalConvs = (fbConvRes.data?.length ?? 0) + (lineConvRes.data?.length ?? 0);
  const convWithLead =
    (fbConvRes.data?.filter((c) => c.lead_id).length ?? 0) +
    (lineConvRes.data?.filter((c) => c.lead_id).length ?? 0);
  const fast5 = fbStats.fast5 + lineStats.fast5;
  const slow5 = fbStats.slow5 + lineStats.slow5;

  // --- Build Flex Bubble ---
  const body: object[] = [];

  // Section: ลีดวันนี้
  body.push({ type: "box", layout: "vertical", margin: "none", contents: [fSectionTitle("📥 ลีดวันนี้")] });
  body.push(fStatRow("ลีดใหม่ทั้งหมด", totalLeads));
  body.push(fStatRow("เลิกติดตามวันนี้", totalUnfollow));

  // Section: แชท
  body.push(fSep());
  body.push({ type: "box", layout: "vertical", margin: "lg", contents: [fSectionTitle("💬 แชทวันนี้")] });
  body.push(fStatRow("แชทที่มีการตอบ", totalConvs));
  body.push(fStatRow("เปลี่ยนเป็นลีด", convWithLead));
  body.push(fStatRow("ตอบใน 5 นาที", `${fast5} แชท`));
  body.push(fStatRow("ตอบช้า >5 นาที", `${slow5} แชท`));

  // Section: Recall
  body.push(fSep());
  body.push({
    type: "box",
    layout: "vertical",
    margin: "lg",
    contents: [fSectionTitle(`🔄 Recall วันนี้ (${totalRecall} leads)`)],
  });
  if (recallMap.size === 0) {
    body.push(fText("  ไม่มี recall วันนี้", { color: "#9ca3af", size: "sm" }));
  } else {
    for (const [name, count] of [...recallMap.entries()].sort((a, b) => b[1] - a[1])) {
      body.push(fPersonRow(name, `${count} leads`));
    }
  }

  // Section: กิจกรรมรายคน
  body.push(fSep());
  body.push({
    type: "box",
    layout: "vertical",
    margin: "lg",
    contents: [fSectionTitle("📋 กิจกรรมวันนี้ แยกรายคน")],
  });
  if (actMap.size === 0) {
    body.push(fText("  ไม่มีกิจกรรมวันนี้", { color: "#9ca3af", size: "sm" }));
  } else {
    const sorted = [...actMap.entries()].sort((a, b) => b[1].note + b[1].stage - (a[1].note + a[1].stage));
    for (const [name, { note, stage }] of sorted) {
      const parts: string[] = [];
      if (note > 0) parts.push(`comment ${note}`);
      if (stage > 0) parts.push(`เลื่อน stage ${stage}`);
      body.push(fPersonRow(name, parts.join(" · ")));
    }
  }

  const flexMsg = {
    type: "flex",
    altText: `📊 สรุปผลงานวันที่ ${dateLabel}`,
    contents: {
      type: "bubble",
      size: "giga",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1e40af",
        paddingAll: "16px",
        contents: [
          fText("📊 สรุปผลงาน Sales", { bold: true, color: "#ffffff", size: "xl" }),
          fText(dateLabel, { color: "#bfdbfe", size: "sm" }),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "16px",
        contents: body,
      },
    },
  };

  await pushLineGroup([flexMsg]);

  return NextResponse.json({
    ok: true,
    date: dateLabel,
    totalLeads,
    totalUnfollow,
    totalConvs,
    convWithLead,
    fast5,
    slow5,
    totalRecall,
    activityPersons: actMap.size,
  });
}
