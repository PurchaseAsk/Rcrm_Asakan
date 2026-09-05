"use client";

import { useEffect, useState } from "react";
import { Plus, Search, BriefcaseIcon, MessageSquare, Bell } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Case, CaseActivity, CaseReminder, Profile, Role } from "@/types/crm";
import { CaseDrawer } from "@/components/CaseDrawer";

const supabase = createBrowserSupabase();

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function caseAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (mins < 60) return `${mins} นาที`;
  if (hours < 24) return `${hours} ชม.`;
  if (days < 30) return `${days} วัน`;
  const months = Math.floor(days / 30);
  return `${months} เดือน${days % 30 > 0 ? ` ${days % 30} วัน` : ""}`;
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "เมื่อกี้";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  if (days === 1) return "เมื่อวาน";
  if (days < 7) return `${days} วันที่แล้ว`;
  return fmtDate(iso);
}

function fmtReminderDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const timeStr = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `วันนี้ ${timeStr}`;
  if (d.toDateString() === tomorrow.toDateString()) return `พรุ่งนี้ ${timeStr}`;
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short" }) + ` ${timeStr}`;
}

const statusConfig: Record<Case["status"], { label: string; dot: string; bg: string }> = {
  active:        { label: "กำลังดำเนินการ", dot: "bg-blue-500",   bg: "bg-blue-50 text-blue-700" },
  pending_close: { label: "รออนุมัติปิด",   dot: "bg-amber-500",  bg: "bg-amber-50 text-amber-700" },
  closed:        { label: "ปิดแล้ว",        dot: "bg-slate-400",  bg: "bg-slate-100 text-slate-500" },
};

const labelConfig: Record<Case["label"], { label: string; dot: string; bg: string }> = {
  in_progress:    { label: "กำลังดำเนินการ", dot: "bg-blue-500",    bg: "bg-blue-50 text-blue-700" },
  docs_submitted: { label: "ยื่นเอกสารแล้ว",  dot: "bg-emerald-500", bg: "bg-emerald-50 text-emerald-700" },
  bank_accepted:  { label: "รับเคสแล้ว",       dot: "bg-indigo-500",  bg: "bg-indigo-50 text-indigo-700" },
};

export function CasesPanel({
  cases,
  profiles,
  userId,
  userRole,
  reload,
  toast,
}: {
  cases: Case[];
  profiles: Profile[];
  userId: string;
  userRole: Role;
  reload: () => Promise<void>;
  toast: (msg: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | Case["status"]>("open");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newAssign, setNewAssign] = useState(userId);
  const [busy, setBusy] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [lastActivities, setLastActivities] = useState<Record<string, CaseActivity>>({});
  const [nextReminders, setNextReminders] = useState<Record<string, CaseReminder>>({});

  useEffect(() => {
    if (!cases.length) return;
    const ids = cases.map((c) => c.id);

    void (async () => {
      const [{ data: acts }, { data: rems }] = await Promise.all([
        supabase
          .from("case_activities")
          .select("id,case_id,type,content,attachment_url,created_by,created_at,profiles(id,full_name,email,role)")
          .in("case_id", ids)
          .order("created_at", { ascending: false }),
        supabase
          .from("case_reminders")
          .select("*")
          .in("case_id", ids)
          .eq("is_done", false)
          .gte("remind_at", new Date().toISOString())
          .order("remind_at", { ascending: true }),
      ]);

      // Keep only the latest activity per case
      const actMap: Record<string, CaseActivity> = {};
      for (const a of (acts ?? []) as unknown as CaseActivity[]) {
        if (!actMap[a.case_id]) actMap[a.case_id] = a;
      }
      setLastActivities(actMap);

      // Keep only the earliest upcoming reminder per case
      const remMap: Record<string, CaseReminder> = {};
      for (const r of (rems ?? []) as CaseReminder[]) {
        if (!remMap[r.case_id]) remMap[r.case_id] = r;
      }
      setNextReminders(remMap);
    })();
  }, [cases]);

  const filtered = cases.filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "open"
        ? c.status === "active" || c.status === "pending_close"
        : c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  function profileName(id: string | null) {
    if (!id) return "—";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? "—";
  }

  function actorLabel(act: CaseActivity) {
    const p = act.profiles as Profile | null | undefined;
    return p?.full_name ?? p?.email ?? "ไม่ระบุ";
  }

  async function createCase() {
    if (!newTitle.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.from("cases").insert({
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      customer_name: newCustomerName.trim() || null,
      customer_phone: newCustomerPhone.trim() || null,
      assigned_to: newAssign || null,
      created_by: userId,
      status: "active",
    }).select().single();
    if (error) { toast(error.message); setBusy(false); return; }

    await supabase.from("case_activities").insert({
      case_id: data.id,
      type: "status_change",
      content: `สร้างเคสโดย ${profileName(userId)}`,
      created_by: userId,
    });

    setNewTitle(""); setNewDesc(""); setNewCustomerName(""); setNewCustomerPhone(""); setNewAssign(userId);
    setShowCreate(false);
    await reload();
    setBusy(false);
    toast("สร้างเคสสำเร็จ");
  }

  const counts = {
    open: cases.filter((c) => c.status === "active" || c.status === "pending_close").length,
    active: cases.filter((c) => c.status === "active").length,
    pending_close: cases.filter((c) => c.status === "pending_close").length,
    closed: cases.filter((c) => c.status === "closed").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BriefcaseIcon size={20} className="text-brand-700" />
          <h2 className="text-lg font-bold text-slate-900">เคสรอโอน</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{counts.open}</span>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          <Plus size={15} /> สร้างเคสใหม่
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-brand-800">เคสใหม่</p>
          <input
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
            placeholder="ชื่อเคส เช่น ห้อง 702 อาคาร Wela 2 *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="ชื่อลูกค้า"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
            />
            <input
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="เบอร์โทร"
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value)}
              type="tel"
            />
          </div>
          <textarea
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
            placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
            rows={2}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ผู้รับผิดชอบ</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              value={newAssign}
              onChange={(e) => setNewAssign(e.target.value)}
            >
              <option value="">— ไม่ระบุ —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void createCase()}
              disabled={!newTitle.trim() || busy}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-brand-800"
            >
              {busy ? "กำลังสร้าง…" : "สร้าง"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-brand-400"
            placeholder="ค้นหาชื่อเคส…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(["open", "active", "pending_close", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`h-9 rounded-lg border px-3 text-xs font-medium transition ${
              statusFilter === s
                ? "border-brand-600 bg-brand-700 text-white"
                : s === "closed"
                  ? "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "open" ? "ทั้งหมด" : statusConfig[s].label}
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* Cases list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50 py-16 text-center">
          <BriefcaseIcon size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">ยังไม่มีเคส</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-brand-600 underline">สร้างเคสแรก</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const cfg = c.status === "active"
              ? labelConfig[c.label ?? "in_progress"]
              : statusConfig[c.status];
            const lastAct = lastActivities[c.id];
            const nextRem = nextReminders[c.id];
            const isPast = nextRem && new Date(nextRem.remind_at) < new Date();
            return (
              <div
                key={c.id}
                onClick={() => setSelectedCase(c)}
                className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md ${
                  c.status === "pending_close" ? "border-amber-200 bg-amber-50/30" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Left: status dot + title + meta */}
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 truncate">{c.title}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg}`}>
                          {cfg.label}
                        </span>
                        {c.status === "closed" && c.close_reason && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${c.close_reason === "transferred" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {c.close_reason === "transferred" ? "โอนแล้ว" : "ยกเลิกสัญญา"}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                        {c.customer_name && (
                          <span className="font-medium text-slate-700">{c.customer_name}</span>
                        )}
                        {c.customer_phone && (
                          <span className="font-medium text-brand-700">{c.customer_phone}</span>
                        )}
                        <span>ผู้รับผิดชอบ: <span className="text-slate-600">{profileName(c.assigned_to)}</span></span>
                        <span>{fmtDate(c.created_at)}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                          ⏱ {caseAge(c.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: last activity + next reminder */}
                  {(lastAct || nextRem) && (
                    <div className="hidden sm:flex shrink-0 items-stretch gap-3 w-[420px] xl:w-[540px]">
                      {/* Last activity */}
                      <div className="flex min-w-0 flex-1 items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <MessageSquare size={13} className="mt-0.5 shrink-0 text-slate-400" />
                        {lastAct ? (
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-xs text-slate-700">{lastAct.content}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {actorLabel(lastAct)} · {fmtRelative(lastAct.created_at)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">ยังไม่มีบันทึก</p>
                        )}
                      </div>

                      {/* Next reminder */}
                      <div className={`flex w-40 xl:w-48 shrink-0 items-start gap-2 rounded-lg px-3 py-2 ${nextRem ? (isPast ? "border border-rose-200 bg-rose-50" : "border border-yellow-200 bg-yellow-50") : "border border-slate-100 bg-slate-50"}`}>
                        <Bell size={13} className={`mt-0.5 shrink-0 ${nextRem ? (isPast ? "text-rose-500" : "text-yellow-500") : "text-slate-300"}`} />
                        {nextRem ? (
                          <div className="min-w-0">
                            <p className={`text-xs font-medium ${isPast ? "text-rose-700" : "text-yellow-700"}`}>
                              {fmtReminderDate(nextRem.remind_at)}
                            </p>
                            {nextRem.note && (
                              <p className={`truncate text-[11px] ${isPast ? "text-rose-500" : "text-yellow-600"}`}>
                                {nextRem.note}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">ไม่มี reminder</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Case drawer */}
      {selectedCase && (
        <CaseDrawer
          caseItem={cases.find((c) => c.id === selectedCase.id) ?? selectedCase}
          profiles={profiles}
          userId={userId}
          userRole={userRole}
          onClose={() => setSelectedCase(null)}
          onUpdated={async () => { await reload(); }}
        />
      )}
    </div>
  );
}
