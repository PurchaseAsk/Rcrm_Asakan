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
    wrap = true,
    align = "start",
  }: { bold?: boolean; color?: string; size?: string; wrap?: boolean; align?: string } = {},
): object {
  return { type: "text", text, size, color, weight: bold ? "bold" : "regular", wrap, align };
}

function fSep(): object {
  return { type: "separator", margin: "lg", color: "#e2e8f0" };
}

function fTitle(text: string): object {
  return fText(text, { bold: true, color: "#1e40af", size: "sm" });
}

function fStatRow(label: string, value: string | number): object {
  return {
    type: "box",
    layout: "horizontal",
    margin: "xs",
    contents: [
      { ...fText(label, { color: "#6b7280", size: "sm", wrap: false }), flex: 3 },
      { ...fText(String(value), { bold: true, color: "#111827", size: "sm", align: "end", wrap: false }), flex: 2 },
    ],
  };
}

function fPersonRow(name: string, detail: string): object {
  return {
    type: "box",
    layout: "horizontal",
    margin: "xs",
    contents: [
      { ...fText(`• ${name}`, { color: "#374151", size: "sm", wrap: false }), flex: 3 },
      { ...fText(detail, { bold: true, color: "#111827", size: "sm", align: "end", wrap: false }), flex: 2 },
    ],
  };
}

function makeBubble(headerBg: string, headerTexts: object[], bodyContents: object[]): object {
  return {
    type: "bubble",
    size: "giga",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerBg,
      paddingAll: "14px",
      contents: headerTexts,
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "14px",
      contents: bodyContents,
    },
  };
}

type PipelineStats = {
  name: string;
  leads: number;
  unfollow: number;
  recallMap: Map<string, number>;
  actMap: Map<string, { note: number; stage: number }>;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = adminSupabase();

  // Today range (UTC+7)
  const offsetMs = 7 * 60 * 60 * 1000;
  const nowThai = new Date(Date.now() + offsetMs);
  const todayStart = new Date(
    Date.UTC(nowThai.getUTCFullYear(), nowThai.getUTCMonth(), nowThai.getUTCDate()) - offsetMs,
  );
  const since = todayStart.toISOString();
  const dateLabel = todayStart.toLocaleDateString("th-TH", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
  });

  const [
    pipelinesRes,
    leadsRes,
    recallRes,
    activityRes,
    unfollowRes,
    fbConvNewRes,
    fbConvAllRes,
    lineConvNewRes,
    fbInboundRes,
    fbOutboundRes,
    lineInboundRes,
    lineOutboundRes,
  ] = await Promise.all([
    // Active pipelines
    supabase.from("pipelines").select("id, name").eq("is_active", true),
    // Leads today with pipeline
    supabase.from("leads").select("id, pipeline_id").gte("created_at", since),
    // Recalls today with pipeline (join leads)
    supabase.from("lead_activities")
      .select("content, leads(pipeline_id)")
      .eq("type", "recalled")
      .gte("created_at", since),
    // Activities today with pipeline and person
    supabase.from("lead_activities")
      .select("type, created_by, leads(pipeline_id), profiles(full_name, email)")
      .in("type", ["note", "stage_change"])
      .gte("created_at", since)
      .not("created_by", "is", null),
    // Unfollowed today with pipeline
    supabase.from("lead_activities")
      .select("leads(pipeline_id)")
      .eq("type", "stage_change")
      .gte("created_at", since)
      .ilike("content", "%เลิกติดตาม%"),
    // FB: new conversations today (created today)
    supabase.from("conversations").select("id", { count: "exact", head: true }).gte("created_at", since),
    // FB: all conversations active today
    supabase.from("conversations").select("id, lead_id").gte("last_message_at", since),
    // LINE OA: new conversations today
    supabase.from("line_conversations").select("id", { count: "exact", head: true }).gte("created_at", since),
    // FB: first inbound per conversation today (response time)
    supabase.from("messages").select("conversation_id, created_at").eq("direction", "inbound").gte("created_at", since).order("created_at"),
    // FB: first outbound per conversation today
    supabase.from("messages").select("conversation_id, created_at").eq("direction", "outbound").gte("created_at", since).order("created_at"),
    // LINE: first inbound per conversation today
    supabase.from("line_messages").select("conversation_id, created_at").eq("direction", "inbound").gte("created_at", since).order("created_at"),
    // LINE: first outbound per conversation today
    supabase.from("line_messages").select("conversation_id, created_at").eq("direction", "outbound").gte("created_at", since).order("created_at"),
  ]);

  // Build pipeline name map
  const pipelineNames = new Map<string, string>();
  for (const p of pipelinesRes.data ?? []) pipelineNames.set(p.id, p.name);

  // Initialize stats per pipeline + "null" bucket for unassigned
  const pipelineStats = new Map<string | null, PipelineStats>();
  const getStats = (pid: string | null): PipelineStats => {
    if (!pipelineStats.has(pid)) {
      pipelineStats.set(pid, {
        name: pid ? (pipelineNames.get(pid) ?? "ไม่ระบุ") : "ไม่ระบุ Pipeline",
        leads: 0, unfollow: 0,
        recallMap: new Map(), actMap: new Map(),
      });
    }
    return pipelineStats.get(pid)!;
  };

  // Leads by pipeline
  for (const lead of leadsRes.data ?? []) {
    getStats(lead.pipeline_id).leads++;
  }
  const totalLeads = leadsRes.data?.length ?? 0;

  // Recalls by pipeline and person
  type RecallRow = { content: string | null; leads: { pipeline_id: string | null } | null };
  for (const r of (recallRes.data ?? []) as unknown as RecallRow[]) {
    const pid = r.leads?.pipeline_id ?? null;
    const match = r.content?.match(/ดึงลีดกลับเข้าส่วนกลางจาก (.+?) หลังอยู่ใน stage/);
    const name = match?.[1] ?? "ไม่ระบุ";
    const stats = getStats(pid);
    stats.recallMap.set(name, (stats.recallMap.get(name) ?? 0) + 1);
  }
  const totalRecall = recallRes.data?.length ?? 0;

  // Activities by pipeline and person
  type ActRow = { type: string; leads: { pipeline_id: string | null } | null; profiles: { full_name: string | null; email: string } | null };
  for (const r of (activityRes.data ?? []) as unknown as ActRow[]) {
    const pid = r.leads?.pipeline_id ?? null;
    const name = r.profiles?.full_name ?? r.profiles?.email ?? "ไม่ระบุ";
    const stats = getStats(pid);
    const cur = stats.actMap.get(name) ?? { note: 0, stage: 0 };
    if (r.type === "note") cur.note++; else cur.stage++;
    stats.actMap.set(name, cur);
  }

  // Unfollow by pipeline
  type UnfollowRow = { leads: { pipeline_id: string | null } | null };
  for (const r of (unfollowRes.data ?? []) as unknown as UnfollowRow[]) {
    getStats(r.leads?.pipeline_id ?? null).unfollow++;
  }
  const totalUnfollow = unfollowRes.data?.length ?? 0;

  // Chat response time (same logic as Dashboard Chat Metrics tab)
  function buildFirstMap(rows: { conversation_id: string; created_at: string }[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const r of rows) { if (!m.has(r.conversation_id)) m.set(r.conversation_id, r.created_at); }
    return m;
  }
  function calcResponse(firstIn: Map<string, string>, firstOut: Map<string, string>) {
    let fast5 = 0, withReply = 0;
    for (const [id, inAt] of firstIn) {
      const outAt = firstOut.get(id);
      if (!outAt) continue;
      withReply++;
      const diff = new Date(outAt).getTime() - new Date(inAt).getTime();
      if (diff >= 0 && diff <= 5 * 60 * 1000) fast5++;
    }
    return { fast5, slow5: withReply - fast5 };
  }

  const fbStats = calcResponse(
    buildFirstMap((fbInboundRes.data ?? []) as { conversation_id: string; created_at: string }[]),
    buildFirstMap((fbOutboundRes.data ?? []) as { conversation_id: string; created_at: string }[]),
  );
  const lineStats = calcResponse(
    buildFirstMap((lineInboundRes.data ?? []) as { conversation_id: string; created_at: string }[]),
    buildFirstMap((lineOutboundRes.data ?? []) as { conversation_id: string; created_at: string }[]),
  );

  const newChats = (fbConvNewRes.count ?? 0) + (lineConvNewRes.count ?? 0);
  const convWithLead = (fbConvAllRes.data ?? []).filter(c => c.lead_id).length;
  const fast5 = fbStats.fast5 + lineStats.fast5;
  const slow5 = fbStats.slow5 + lineStats.slow5;
  const totalResponded = fast5 + slow5;
  const fast5Pct = totalResponded > 0 ? Math.round((fast5 / totalResponded) * 100) : 0;

  // --- Build Flex Carousel ---
  const bubbles: object[] = [];

  // Bubble 1: Overall
  const overallBody: object[] = [
    fTitle("📥 ลีดวันนี้"),
    fStatRow("ลีดใหม่ทั้งหมด", totalLeads),
    fStatRow("เลิกติดตาม", totalUnfollow),
    fStatRow("Recall", `${totalRecall} leads`),
    fSep(),
    { type: "box", layout: "vertical", margin: "lg", contents: [fTitle("💬 แชทวันนี้")] },
    fStatRow("แชทใหม่", newChats),
    fStatRow("เปลี่ยนเป็นลีด", convWithLead),
    fStatRow("ตอบใน 5 นาที", `${fast5} (${fast5Pct}%)`),
    fStatRow("ตอบช้า >5 นาที", slow5),
  ];

  bubbles.push(makeBubble(
    "#1e40af",
    [
      fText("📊 สรุปผลงาน Sales", { bold: true, color: "#ffffff", size: "xl" }),
      fText(dateLabel, { color: "#bfdbfe", size: "sm" }),
    ],
    overallBody,
  ));

  // One bubble per pipeline (only pipelines with activity)
  const PIPELINE_COLORS = ["#065f46", "#7c2d12", "#4c1d95", "#1e3a5f", "#713f12"];
  let colorIdx = 0;

  // Sort pipelines: those with data first
  const activePipelineIds = [...pipelineStats.keys()].filter(
    pid => pid !== null && pipelineStats.get(pid)!.leads + pipelineStats.get(pid)!.recallMap.size + pipelineStats.get(pid)!.actMap.size > 0
  );

  for (const pid of activePipelineIds) {
    const stats = pipelineStats.get(pid)!;
    const body: object[] = [];

    // Leads
    body.push(fTitle("📥 ลีดวันนี้"));
    body.push(fStatRow("ลีดใหม่", stats.leads));
    body.push(fStatRow("เลิกติดตาม", stats.unfollow));

    // Recall
    const recallTotal = [...stats.recallMap.values()].reduce((s, v) => s + v, 0);
    body.push(fSep());
    body.push({ type: "box", layout: "vertical", margin: "lg", contents: [fTitle(`🔄 Recall (${recallTotal} leads)`)] });
    if (stats.recallMap.size === 0) {
      body.push(fText("  ไม่มี recall วันนี้", { color: "#9ca3af", size: "sm" }));
    } else {
      for (const [name, count] of [...stats.recallMap.entries()].sort((a, b) => b[1] - a[1])) {
        body.push(fPersonRow(name, `${count} leads`));
      }
    }

    // Activities
    body.push(fSep());
    body.push({ type: "box", layout: "vertical", margin: "lg", contents: [fTitle("📋 กิจกรรมรายคน")] });
    if (stats.actMap.size === 0) {
      body.push(fText("  ไม่มีกิจกรรมวันนี้", { color: "#9ca3af", size: "sm" }));
    } else {
      const sorted = [...stats.actMap.entries()].sort((a, b) => (b[1].note + b[1].stage) - (a[1].note + a[1].stage));
      for (const [name, { note, stage }] of sorted) {
        const parts: string[] = [];
        if (note > 0) parts.push(`comment ${note}`);
        if (stage > 0) parts.push(`stage ${stage}`);
        body.push(fPersonRow(name, parts.join(" · ")));
      }
    }

    const color = PIPELINE_COLORS[colorIdx % PIPELINE_COLORS.length];
    colorIdx++;

    bubbles.push(makeBubble(
      color,
      [fText(stats.name, { bold: true, color: "#ffffff", size: "xl" })],
      body,
    ));
  }

  const flexMsg = {
    type: "flex",
    altText: `📊 สรุปผลงานวันที่ ${dateLabel}`,
    contents: bubbles.length === 1
      ? bubbles[0]
      : { type: "carousel", contents: bubbles },
  };

  await pushLineGroup([flexMsg]);

  return NextResponse.json({
    ok: true, date: dateLabel,
    totalLeads, totalUnfollow, totalRecall,
    newChats, convWithLead, fast5, slow5, fast5Pct,
    pipelines: activePipelineIds.length,
  });
}
