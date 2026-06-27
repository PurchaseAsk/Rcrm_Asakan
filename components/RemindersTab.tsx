"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, RefreshCcw, CheckCircle, X, Tag } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Reminder } from "@/types/crm";

const supabase = createBrowserSupabase();

type ReminderWithLead = Reminder & { leads?: { id: string; customer_name: string } | null };

export function RemindersTab({
  userId,
  onOpenLead,
  onNavigate,
}: {
  userId: string;
  onOpenLead: (lead: Lead) => void;
  onNavigate?: (tab: string) => void;
}) {
  const [reminders, setReminders] = useState<ReminderWithLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { void load(); }, [load]);

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
              {new Date(r.remind_at).toLocaleString("th-TH")}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-950">การแจ้งเตือน</h2>
        <div className="flex items-center gap-2">
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
            onClick={() => void load()}
          >
            <RefreshCcw size={14} />
            รีเฟรช
          </button>
        </div>
      </div>

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
