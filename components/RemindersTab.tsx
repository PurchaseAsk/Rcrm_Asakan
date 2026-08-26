"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, RefreshCcw, CheckCircle, X, Tag, Megaphone, Trash2, BriefcaseIcon, BarChart2 } from "lucide-react";
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

    // Get user's full_name for recall content matching
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    const myName = myProfile?.full_name ?? "";

    // Stage IDs for "ส่งคูปอง" and "จองแล้ว" across all pipelines
    const [{ data: couponStages }, { data: bookedStages }] = await Promise.all([
      supabase.from("funnel_stages").select("id").eq("name", "ส่งคูปอง"),
      supabase.from("funnel_stages").select("id").eq("name", "จองแล้ว"),
    ]);
    const couponIds = (couponStages ?? []).map((s) => s.id);
    const bookedIds = (bookedStages ?? []).map((s) => s.id);

    const [
      { count: allLeads },
      { count: couponLeads },
      { count: bookedLeads },
      { count: recalledThisMonth },
      { data: chatStats },
    ] = await Promise.all([
      // ลีดทั้งหมด — active leads assigned to me
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("assigned_to", userId)
        .eq("status", "active"),
      // ส่งคูปอง
      couponIds.length > 0
        ? supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("assigned_to", userId)
            .eq("status", "active")
            .in("stage_id", couponIds)
        : Promise.resolve({ count: 0 }),
      // จองแล้ว
      bookedIds.length > 0
        ? supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("assigned_to", userId)
            .eq("status", "active")
            .in("stage_id", bookedIds)
        : Promise.resolve({ count: 0 }),
      // Recall ที่โดนในเดือนนี้ — match by name in content
      myName
        ? supabase
            .from("lead_activities")
            .select("*", { count: "exact", head: true })
            .eq("type", "recalled")
            .ilike("content", `%${myName}%`)
            .gte("created_at", monthStart)
        : Promise.resolve({ count: 0 }),
      // Chat stats via DB function (5-min response rate)
      supabase.rpc("get_monthly_chat_stats", { p_month_start: monthStart }),
    ]);

    const cs = (chatStats as { total_convs: number; replied_in_5min: number; converted: number }[] | null)?.[0];

    setDashStats({
      allLeads: allLeads ?? 0,
      couponLeads: couponLeads ?? 0,
      bookedLeads: bookedLeads ?? 0,
      recalledThisMonth: recalledThisMonth ?? 0,
      teamConvs: cs?.total_convs ?? 0,
      teamReplied5min: cs?.replied_in_5min ?? 0,
      teamConverted: cs?.converted ?? 0,
    });
    setDashLoading(false);
  }, [userId]);

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
                      {/* Personal stats */}
                      <div>
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">ผลงานของฉัน</p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-4">
                            <div className="text-3xl font-bold text-brand-700">{dashStats.allLeads}</div>
                            <div className="mt-1 text-xs font-medium text-brand-600">Lead ทั้งหมด</div>
                          </div>
                          <div className="rounded-xl border px-4 py-4" style={{ borderColor: "#ec489940", backgroundColor: "#ec48990d" }}>
                            <div className="text-3xl font-bold" style={{ color: "#ec4899" }}>{dashStats.couponLeads}</div>
                            <div className="mt-1 text-xs font-medium" style={{ color: "#ec4899" }}>ส่งคูปอง</div>
                          </div>
                          <div className="rounded-xl border px-4 py-4" style={{ borderColor: "#2563eb40", backgroundColor: "#2563eb0d" }}>
                            <div className="text-3xl font-bold" style={{ color: "#2563eb" }}>{dashStats.bookedLeads}</div>
                            <div className="mt-1 text-xs font-medium" style={{ color: "#2563eb" }}>จองแล้ว</div>
                          </div>
                          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-4">
                            <div className="text-3xl font-bold text-rose-600">{dashStats.recalledThisMonth}</div>
                            <div className="mt-1 text-xs font-medium text-rose-500">Recall เดือนนี้</div>
                          </div>
                        </div>
                      </div>

                      {/* Team chat stats */}
                      <div>
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">ทั้งทีม — แชทเดือนนี้</p>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-center">
                            <div className="text-3xl font-bold text-slate-800">{dashStats.teamConvs}</div>
                            <div className="mt-1 text-xs text-slate-500">แชทใหม่</div>
                          </div>
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-center">
                            <div className="text-3xl font-bold text-emerald-600">{dashStats.teamReplied5min}</div>
                            <div className="mt-1 text-xs text-emerald-600">
                              ตอบใน 5 นาที
                              {dashStats.teamConvs > 0 && (
                                <span className="ml-1 font-semibold">
                                  ({Math.round((dashStats.teamReplied5min / dashStats.teamConvs) * 100)}%)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-center">
                            <div className="text-3xl font-bold text-blue-600">{dashStats.teamConverted}</div>
                            <div className="mt-1 text-xs text-blue-600">
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
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

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
