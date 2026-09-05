"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, RefreshCcw, CheckCircle, X, Tag, Megaphone, Trash2, BriefcaseIcon, BarChart2, Sparkles, Copy } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Reminder, Role, TeamReminder } from "@/types/crm";

const supabase = createBrowserSupabase();

type ReminderWithLead = Reminder & { leads?: { id: string; customer_name: string } | null };
type TeamReminderWithProfile = TeamReminder & { profiles?: { id: string; full_name: string | null; email: string } | null };

type DashStats = {
  allLeads: number;
  couponLeads: number;
  bookedLeads: number;
  recalledThisMonth: number;
  teamConvs: number;
  teamReplied5min: number;
  teamConverted: number;
};

export function RemindersTab({
  userId,
  userRole,
  onOpenLead,
  onNavigate,
}: {
  userId: string;
  userRole: Role;
  onOpenLead: (lead: Lead) => void;
  onNavigate?: (tab: string) => void;
}) {
  const canManageTeamReminders = userRole === "admin" || userRole === "team_lead";
  const [reminders, setReminders] = useState<ReminderWithLead[]>([]);
  const [teamReminders, setTeamReminders] = useState<TeamReminderWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [teamDraft, setTeamDraft] = useState({ title: "", body: "" });
  const [teamSaving, setTeamSaving] = useState(false);
  const [dashStats, setDashStats] = useState<DashStats | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashCollapsed, setDashCollapsed] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptDateFrom, setPromptDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [promptDateTo, setPromptDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [promptProjectName, setPromptProjectName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("lead_reminders")
      .select("*, leads(id, customer_name)")
      .eq("created_by", userId)
      .gte("remind_at", todayStart.toISOString())
      .order("remind_at", { ascending: true });
    setReminders((data || []) as ReminderWithLead[]);
    setLoading(false);
  }, [userId]);

  const loadTeamReminders = useCallback(async () => {
    setTeamLoading(true);
    const { data } = await supabase
      .from("team_reminders")
      .select("*, profiles(id, full_name, email)")
      .order("created_at", { ascending: false });
    setTeamReminders((data || []) as TeamReminderWithProfile[]);
    setTeamLoading(false);
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: myProfile }, { data: allStagesData }, { data: monthLeadsData }, chatStats] =
      await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).single(),
        supabase.from("funnel_stages").select("id, name, position"),
        supabase.from("leads").select("id, stage_id").eq("assigned_to", userId).gte("created_at", monthStart),
        supabase.rpc("get_monthly_chat_stats", { p_month_start: monthStart }),
      ]);

    const myName = myProfile?.full_name ?? "";
    const allStages = allStagesData ?? [];
    const monthLeads = monthLeadsData ?? [];

    // position map: stage_id → position
    const stagePos = new Map(allStages.map((s) => [s.id, s.position]));

    // min position for target stage name across all pipelines
    const minPosOf = (name: string) => {
      const ps = allStages.filter((s) => s.name === name).map((s) => s.position);
      return ps.length > 0 ? Math.min(...ps) : Infinity;
    };
    const couponMinPos = minPosOf("ส่งคูปอง");
    const bookedMinPos = minPosOf("จองแล้ว");

    // cumulative position logic — same as Dashboard's expandedStagesByLead:
    // lead counts for a stage if current stage position >= that stage's position
    const couponLeads = monthLeads.filter((l) => {
      const pos = l.stage_id ? (stagePos.get(l.stage_id) ?? -1) : -1;
      return pos >= couponMinPos;
    }).length;
    const bookedLeads = monthLeads.filter((l) => {
      const pos = l.stage_id ? (stagePos.get(l.stage_id) ?? -1) : -1;
      return pos >= bookedMinPos;
    }).length;

    const recalledCount = myName
      ? await supabase
          .from("lead_activities")
          .select("*", { count: "exact", head: true })
          .eq("type", "recalled")
          .ilike("content", `%${myName}%`)
          .gte("created_at", monthStart)
          .then(({ count }) => count ?? 0)
      : 0;

    const cs = (chatStats.data as { total_convs: number; replied_in_5min: number; converted: number }[] | null)?.[0];

    setDashStats({
      allLeads: monthLeads.length,
      couponLeads,
      bookedLeads,
      recalledThisMonth: recalledCount,
      teamConvs: cs?.total_convs ?? 0,
      teamReplied5min: cs?.replied_in_5min ?? 0,
      teamConverted: cs?.converted ?? 0,
    });
    setDashLoading(false);
  }, [userId]);

  async function generatePrompt() {
    setPromptLoading(true);
    const fromISO = `${promptDateFrom}T00:00:00+07:00`;
    const toISO = `${promptDateTo}T23:59:59+07:00`;
    const fromLabel = new Date(promptDateFrom).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    const toLabel = new Date(promptDateTo).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    const dateRangeLabel = promptDateFrom === promptDateTo ? fromLabel : `${fromLabel} – ${toLabel}`;

    const [
      { data: monthLeadsData },
      { data: allStagesData },
      { data: allProfilesData },
      { data: allCasesData },
      { data: recallData },
    ] = await Promise.all([
      supabase.from("leads").select("id, source, stage_id, assigned_to, metadata").gte("created_at", fromISO).lte("created_at", toISO),
      supabase.from("funnel_stages").select("id, name, position, is_unfollow"),
      supabase.from("profiles").select("id, full_name, email, role"),
      supabase.from("cases").select("id, label, status"),
      supabase.from("lead_activities").select("id").eq("type", "recalled").gte("created_at", fromISO).lte("created_at", toISO),
    ]);

    const leads = monthLeadsData ?? [];
    const stages = allStagesData ?? [];
    const profiles = allProfilesData ?? [];
    const cases = allCasesData ?? [];
    const recallCount = (recallData ?? []).length;

    const stagePos = new Map(stages.map((s) => [s.id, s.position]));
    // Deduplicate stages by name across pipelines (keep first occurrence per name, sorted by position)
    const seenNames = new Set<string>();
    const orderedStages = stages
      .filter((s) => !s.is_unfollow)
      .sort((a, b) => a.position - b.position)
      .filter((s) => { if (seenNames.has(s.name)) return false; seenNames.add(s.name); return true; });

    // Source breakdown
    const sourceCount: Record<string, number> = {};
    for (const l of leads) {
      const src = l.source ?? "Facebook";
      sourceCount[src] = (sourceCount[src] ?? 0) + 1;
    }

    // Top ad campaigns from metadata
    const campaignCount: Record<string, number> = {};
    for (const l of leads) {
      const meta = l.metadata as { campaign_name?: string } | null;
      if (meta?.campaign_name) campaignCount[meta.campaign_name] = (campaignCount[meta.campaign_name] ?? 0) + 1;
    }
    const topCampaigns = Object.entries(campaignCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Funnel counts (cumulative — same as dashboard)
    const stageCounts = orderedStages.map((s) => ({
      name: s.name,
      count: leads.filter((l) => {
        const pos = l.stage_id ? (stagePos.get(l.stage_id) ?? -1) : -1;
        return pos >= s.position;
      }).length,
    }));

    // Team performance
    const teamCount: Record<string, number> = {};
    for (const l of leads) {
      if (l.assigned_to) teamCount[l.assigned_to] = (teamCount[l.assigned_to] ?? 0) + 1;
    }
    const salesProfiles = profiles.filter((p) => p.role === "staff" || p.role === "team_lead");

    // Cases
    const activeCases = cases.filter((c) => c.status === "active" || c.status === "pending_close");
    const caseStats = {
      in_progress: activeCases.filter((c) => c.label === "in_progress").length,
      docs_submitted: activeCases.filter((c) => c.label === "docs_submitted").length,
      bank_accepted: activeCases.filter((c) => c.label === "bank_accepted").length,
      closed: cases.filter((c) => c.status === "closed").length,
    };

    const totalLeads = leads.length;
    const bookedCount = stageCounts.find((s) => s.name === "จองแล้ว")?.count ?? 0;
    const convRate = totalLeads > 0 ? ((bookedCount / totalLeads) * 100).toFixed(1) : "0";

    // Build prompt
    const projectName = promptProjectName.trim() || "โครงการอสังหาริมทรัพย์";
    let p = `คุณคือที่ปรึกษาด้านการตลาดและ Sales ที่มีความเชี่ยวชาญด้านการวิเคราะห์ข้อมูล CRM\n\n`;
    p += `🏢 โครงการ: ${projectName}\n`;
    p += `📊 ข้อมูล Performance ช่วง ${dateRangeLabel}\n`;
    p += `${"─".repeat(50)}\n\n`;

    p += `[ภาพรวมลีด]\n`;
    p += `- ลีดเข้าใหม่ทั้งหมด: ${totalLeads} ราย\n`;
    const srcLines = Object.entries(sourceCount).sort((a, b) => b[1] - a[1]).map(([s, n]) => `  • ${s}: ${n} ราย`).join("\n");
    if (srcLines) p += `- แหล่งที่มา:\n${srcLines}\n`;
    if (topCampaigns.length > 0) {
      p += `- แคมเปญโฆษณาที่มีลีดสูงสุด:\n`;
      for (const [name, n] of topCampaigns) p += `  • ${name}: ${n} ราย\n`;
    }

    p += `\n[Funnel Sales]\n`;
    for (const { name, count } of stageCounts) {
      const pct = totalLeads > 0 ? ((count / totalLeads) * 100).toFixed(0) : "0";
      p += `- ${name}: ${count} ราย (${pct}%)\n`;
    }
    p += `- Conversion Rate (ลีด → จอง): ${convRate}%\n`;

    p += `\n[ทีม Sales — ${salesProfiles.length} คน]\n`;
    for (const sp of salesProfiles) {
      const n = teamCount[sp.id] ?? 0;
      p += `- ${sp.full_name ?? sp.email}: ${n} ลีด\n`;
    }
    p += `- Recall เดือนนี้: ${recallCount} ครั้ง\n`;

    p += `\n[เคสรอโอน]\n`;
    p += `- กำลังดำเนินการ: ${caseStats.in_progress} เคส\n`;
    p += `- ยื่นเอกสารแล้ว: ${caseStats.docs_submitted} เคส\n`;
    p += `- รับเคสแล้ว: ${caseStats.bank_accepted} เคส\n`;
    p += `- ปิดแล้ว (ทั้งหมด): ${caseStats.closed} เคส\n`;

    p += `\n${"─".repeat(50)}\n`;
    p += `กรุณาวิเคราะห์ข้อมูลข้างต้นและให้คำแนะนำใน 5 ประเด็น:\n\n`;
    p += `1. ภาพรวม Performance — Ads และ Sales เดือนนี้เป็นอย่างไร? จุดแข็ง/จุดอ่อนหลักคืออะไร?\n`;
    p += `2. จุดที่ต้องปรับปรุงเร่งด่วน — ขั้นตอน Funnel ไหนที่ลีด Drop off มากที่สุด? แก้ได้อย่างไร?\n`;
    p += `3. แนวทางการตลาดสำหรับเดือนหน้า — ควรเน้น Ad ชุดไหน? ปรับ targeting อย่างไร?\n`;
    p += `4. เพิ่ม Conversion Rate — วิธีเพิ่มโอกาสปิดจองจากลีดที่มีอยู่?\n`;
    p += `5. ข้อเสนอแนะเฉพาะ — มีอะไรที่ควรลองทำทันทีจากข้อมูลเดือนนี้?\n`;

    setPromptText(p);
    setPromptLoading(false);
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptText);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadTeamReminders(); }, [loadTeamReminders]);
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  async function createTeamReminder() {
    if (!teamDraft.title.trim() || !canManageTeamReminders) return;
    setTeamSaving(true);
    try {
      const { error } = await supabase.from("team_reminders").insert({
        title: teamDraft.title.trim(),
        body: teamDraft.body.trim() || null,
        created_by: userId,
      });
      if (!error) {
        setTeamDraft({ title: "", body: "" });
        await loadTeamReminders();
      }
    } finally {
      setTeamSaving(false);
    }
  }

  async function deleteTeamReminder(id: string) {
    if (!canManageTeamReminders) return;
    const ok = window.confirm("ลบประกาศนี้?");
    if (!ok) return;
    await supabase.from("team_reminders").delete().eq("id", id);
    await loadTeamReminders();
  }

  async function confirmDone(r: ReminderWithLead) {
    if (!completionNote.trim()) return;
    setSaving(true);
    try {
      await supabase.from("lead_reminders").update({ is_done: true }).eq("id", r.id);
      if (r.leads?.id) {
        await supabase.from("lead_activities").insert({
          lead_id: r.leads.id,
          type: "note",
          content: `✅ ทำเสร็จแล้ว: ${completionNote.trim()}`,
          created_by: userId,
        });
      }
      setCompletingId(null);
      setCompletionNote("");
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function openLead(r: ReminderWithLead) {
    if (!r.leads?.id) return;
    const { data } = await supabase
      .from("leads")
      .select("*, stage:funnel_stages(*), page:facebook_pages(id,page_id,name,is_active), assigned:profiles!leads_assigned_to_fkey(id,email,full_name,role), lead_tags(tag_id, tags(id,name,color,type,created_by))")
      .eq("id", r.leads.id)
      .single();
    if (data) onOpenLead(data as Lead);
  }

  const tomorrowStart = new Date();
  tomorrowStart.setHours(0, 0, 0, 0);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const today = reminders.filter((r) => new Date(r.remind_at) < tomorrowStart);
  const upcoming = reminders.filter((r) => new Date(r.remind_at) >= tomorrowStart && !r.is_done);

  function ReminderCard({ r }: { r: ReminderWithLead }) {
    const isPast = !r.is_done && new Date(r.remind_at) < new Date();
    const isCompleting = completingId === r.id;

    return (
      <div className={`rounded-lg border p-3 transition-all ${r.is_done ? "border-slate-100 bg-slate-50 opacity-60" : isPast ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
        <div className="flex items-start gap-3">
          <Bell size={16} className={`mt-0.5 shrink-0 ${r.is_done ? "text-slate-400" : isPast ? "text-amber-500" : "text-brand-600"}`} />
          <div className="min-w-0 flex-1">
            <button
              className="truncate text-sm font-medium text-slate-950 hover:underline"
              onClick={() => void openLead(r)}
            >
              {r.leads?.customer_name || "Lead"}
            </button>
            <div className="mt-0.5 text-xs text-slate-500">
              {new Date(r.remind_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
              {r.note && <span className="ml-2 text-slate-700">· {r.note}</span>}
            </div>
          </div>
          {!r.is_done && (
            <button
              className={`shrink-0 rounded p-1 transition ${isCompleting ? "bg-slate-100 text-slate-400" : "text-slate-400 hover:bg-slate-100 hover:text-emerald-600"}`}
              title="Mark done"
              onClick={() => {
                if (isCompleting) { setCompletingId(null); setCompletionNote(""); }
                else { setCompletingId(r.id); setCompletionNote(""); }
              }}
            >
              {isCompleting ? <X size={16} /> : <CheckCircle size={16} />}
            </button>
          )}
        </div>

        {isCompleting && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1.5 text-xs font-medium text-slate-600">บันทึกผลการติดตาม <span className="text-rose-500">*</span></p>
            <div className="flex gap-2">
              <input
                autoFocus
                className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                placeholder="เช่น โทรแล้ว นัดวันศุกร์, ส่ง email แล้ว..."
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void confirmDone(r); }}
              />
              <button
                className="rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50"
                disabled={!completionNote.trim() || saving}
                onClick={() => void confirmDone(r)}
              >
                {saving ? "…" : "บันทึก"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function TeamReminderCard({ item }: { item: TeamReminderWithProfile }) {
    const author = item.profiles?.full_name || item.profiles?.email || "Manager";
    return (
      <div className="min-h-[112px] rounded-lg border border-amber-200 bg-amber-50/70 p-3 shadow-sm">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Megaphone size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="line-clamp-1 text-sm font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-0.5 truncate text-[11px] text-amber-700/80">
                  {author} · {new Date(item.created_at).toLocaleString("th-TH")}
                </p>
              </div>
              {canManageTeamReminders && (
                <button
                  className="shrink-0 rounded p-1 text-amber-500 hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                  onClick={() => void deleteTeamReminder(item.id)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            {item.body && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{item.body}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-950">การแจ้งเตือน</h2>
        <div className="flex items-center gap-2">
          {onNavigate && (
            <button
              className="flex h-9 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
              onClick={() => onNavigate("cases")}
            >
              <BriefcaseIcon size={14} />
              เคสรอโอน
            </button>
          )}
          {onNavigate && (
            <button
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => onNavigate("my-tags")}
            >
              <Tag size={14} />
              แท็กของฉัน
            </button>
          )}
          <button
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => { void load(); void loadTeamReminders(); void loadDashboard(); }}
          >
            <RefreshCcw size={14} />
            รีเฟรช
          </button>
        </div>
      </div>

        {/* ── Monthly Dashboard ─────────────────────────────── */}
        {(() => {
          const now = new Date();
          const monthLabel = now.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
          return (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                onClick={() => setDashCollapsed((v) => !v)}
                className="flex w-full items-center gap-2 px-5 py-3.5 text-left"
              >
                <BarChart2 size={16} className="shrink-0 text-brand-600" />
                <span className="flex-1 text-sm font-semibold text-slate-900">ยอดสรุปประจำเดือน {monthLabel}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${dashCollapsed ? "-rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {!dashCollapsed && (
                <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-5">
                  {dashLoading || !dashStats ? (
                    <p className="text-sm text-slate-400">กำลังโหลด…</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-0 divide-y divide-slate-100 lg:flex-row lg:divide-x lg:divide-y-0">
                        {/* Left: Personal stats */}
                        <div className="flex-1 pr-0 pb-4 lg:pr-5 lg:pb-0">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">ผลงานของฉัน</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
                              <div className="text-2xl font-bold text-brand-700">{dashStats.allLeads}</div>
                              <div className="mt-0.5 text-xs font-medium text-brand-600">Lead ทั้งหมด</div>
                            </div>
                            <div className="rounded-xl border px-4 py-3" style={{ borderColor: "#ec489940", backgroundColor: "#ec48990d" }}>
                              <div className="text-2xl font-bold" style={{ color: "#ec4899" }}>{dashStats.couponLeads}</div>
                              <div className="mt-0.5 text-xs font-medium" style={{ color: "#ec4899" }}>ส่งคูปอง</div>
                            </div>
                            <div className="rounded-xl border px-4 py-3" style={{ borderColor: "#2563eb40", backgroundColor: "#2563eb0d" }}>
                              <div className="text-2xl font-bold" style={{ color: "#2563eb" }}>{dashStats.bookedLeads}</div>
                              <div className="mt-0.5 text-xs font-medium" style={{ color: "#2563eb" }}>จองแล้ว</div>
                            </div>
                            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                              <div className="text-2xl font-bold text-rose-600">{dashStats.recalledThisMonth}</div>
                              <div className="mt-0.5 text-xs font-medium text-rose-500">Recall เดือนนี้</div>
                            </div>
                          </div>
                        </div>

                        {/* Right: Team chat stats */}
                        <div className="flex-1 pt-4 pl-0 lg:pl-5 lg:pt-0">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">ทั้งทีม — แชทเดือนนี้</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                              <div className="text-2xl font-bold text-slate-800">{dashStats.teamConvs}</div>
                              <div className="mt-0.5 text-xs text-slate-500">แชทใหม่</div>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center">
                              <div className="text-2xl font-bold text-emerald-600">{dashStats.teamReplied5min}</div>
                              <div className="mt-0.5 text-xs text-emerald-600">
                                ตอบใน 5 นาที
                                {dashStats.teamConvs > 0 && (
                                  <span className="ml-1 font-semibold">
                                    ({Math.round((dashStats.teamReplied5min / dashStats.teamConvs) * 100)}%)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center">
                              <div className="text-2xl font-bold text-blue-600">{dashStats.teamConverted}</div>
                              <div className="mt-0.5 text-xs text-blue-600">
                                เปลี่ยนเป็นลีด
                                {dashStats.teamConvs > 0 && (
                                  <span className="ml-1 font-semibold">
                                    ({Math.round((dashStats.teamConverted / dashStats.teamConvs) * 100)}%)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      {/* ── AI Prompt Generator ─────────────────────────────── */}
      {canManageTeamReminders && (
        <div className="rounded-xl border border-violet-200 bg-white shadow-sm">
          <div className="px-5 py-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="shrink-0 text-violet-500" />
              <span className="text-sm font-semibold text-slate-900">วิเคราะห์ Performance ด้วย AI</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="h-8 flex-1 min-w-40 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-400 placeholder:text-slate-400"
                placeholder="ชื่อโครงการ เช่น Wela Asakan"
                value={promptProjectName}
                onChange={(e) => setPromptProjectName(e.target.value)}
              />
              <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                <span>จาก</span>
                <input
                  type="date"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-violet-400"
                  value={promptDateFrom}
                  onChange={(e) => setPromptDateFrom(e.target.value)}
                />
                <span>ถึง</span>
                <input
                  type="date"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-violet-400"
                  value={promptDateTo}
                  onChange={(e) => setPromptDateTo(e.target.value)}
                />
              </div>
              <button
                onClick={() => void generatePrompt()}
                disabled={promptLoading}
                className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {promptLoading ? "กำลังสร้าง…" : "สร้าง Prompt"}
              </button>
            </div>
          </div>
          {promptText && (
            <div className="border-t border-violet-100 px-5 pb-5 pt-4">
              <div className="relative">
                <textarea
                  readOnly
                  className="h-52 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs leading-relaxed text-slate-700 outline-none"
                  value={promptText}
                />
                <button
                  onClick={() => void copyPrompt()}
                  className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 transition"
                >
                  <Copy size={12} />
                  {promptCopied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">นำ Prompt นี้ไปวางใน Claude, ChatGPT หรือ AI อื่นๆ</p>
            </div>
          )}
        </div>
      )}

        <section className="space-y-4">
          {canManageTeamReminders && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(180px,260px)_1fr_auto]">
                <input
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  placeholder="หัวข้อประกาศ"
                  value={teamDraft.title}
                  onChange={(e) => setTeamDraft((prev) => ({ ...prev, title: e.target.value }))}
                />
                <input
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                  placeholder="รายละเอียด"
                  value={teamDraft.body}
                  onChange={(e) => setTeamDraft((prev) => ({ ...prev, body: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") void createTeamReminder(); }}
                />
                <button
                  className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50"
                  disabled={!teamDraft.title.trim() || teamSaving}
                  onClick={() => void createTeamReminder()}
                >
                  {teamSaving ? "..." : "ประกาศ"}
                </button>
              </div>
            </div>
          )}

          {teamLoading ? (
            <p className="text-sm text-slate-400">กำลังโหลด...</p>
          ) : teamReminders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              ยังไม่มีประกาศทีม
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
              {teamReminders.map((item) => <TeamReminderCard key={item.id} item={item} />)}
            </div>
          )}
        </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          วันนี้ ({today.length})
        </h3>
        {loading ? (
          <p className="text-sm text-slate-400">กำลังโหลด…</p>
        ) : today.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
            ไม่มีการแจ้งเตือนสำหรับวันนี้
          </p>
        ) : (
          <div className="space-y-2">
            {today.map((r) => <ReminderCard key={r.id} r={r} />)}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          ยังไม่ถึง ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
            ไม่มีการแจ้งเตือนที่กำลังจะมาถึง
          </p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((r) => <ReminderCard key={r.id} r={r} />)}
          </div>
        )}
      </section>
    </div>
  );
}
