"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Bell, CheckCircle, BriefcaseIcon, Paperclip, Image as ImageIcon } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Case, CaseActivity, CaseReminder, Profile, Role } from "@/types/crm";

const supabase = createBrowserSupabase();

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function caseAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (mins < 60) return `${mins} เธเธฒเธ—เธต`;
  if (hours < 24) return `${hours} เธเธก.`;
  if (days < 30) return `${days} เธงเธฑเธ`;
  const months = Math.floor(days / 30);
  return `${months} เน€เธ”เธทเธญเธ${days % 30 > 0 ? ` ${days % 30} เธงเธฑเธ` : ""}`;
}

function actorLabel(profiles: Profile[], id: string | null) {
  if (!id) return "เธฃเธฐเธเธ";
  const p = profiles.find((x) => x.id === id);
  return p?.full_name ?? p?.email ?? "เนเธกเนเธฃเธฐเธเธธ";
}

// Convert local datetime strings to ISO for storage
function toISO(date: string, time: string): string | null {
  if (!date) return null;
  return new Date(`${date}T${time || "08:00"}`).toISOString();
}

const typeIcon: Record<CaseActivity["type"], string> = {
  note: "๐“",
  status_change: "๐”",
  close_request: "๐“",
  closed: "โ…",
  reopened: "๐”“",
};

export function CaseDrawer({
  caseItem,
  profiles,
  userId,
  userRole,
  onClose,
  onUpdated,
}: {
  caseItem: Case;
  profiles: Profile[];
  userId: string;
  userRole: Role;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [confirmEdit, setConfirmEdit] = useState<"title" | "customer" | "finance" | null>(null);
  const [activities, setActivities] = useState<CaseActivity[]>([]);
  const [reminders, setReminders] = useState<CaseReminder[]>([]);
  const [note, setNote] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [reminderNote, setReminderNote] = useState("");
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completingReminderId, setCompletingReminderId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [editTitle, setEditTitle] = useState(caseItem.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [customerName, setCustomerName] = useState(caseItem.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(caseItem.customer_phone ?? "");
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [paymentType, setPaymentType] = useState<"cash" | "loan" | "">(caseItem.payment_type ?? "");
  const [loanBanks, setLoanBanks] = useState<string[]>(caseItem.loan_banks ?? ["", "", "", ""]);
  const [editingFinance, setEditingFinance] = useState(false);
  const [assignTo, setAssignTo] = useState(caseItem.assigned_to ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canClose = userRole === "admin" || userRole === "team_lead";
  const isPendingClose = caseItem.status === "pending_close";
  const isClosed = caseItem.status === "closed";

  async function load() {
    const [{ data: acts }, { data: rems }] = await Promise.all([
      supabase
        .from("case_activities")
        .select("*, profiles(id,email,full_name,role)")
        .eq("case_id", caseItem.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("case_reminders")
        .select("*")
        .eq("case_id", caseItem.id)
        .eq("is_done", false)
        .order("remind_at"),
    ]);
    setActivities((acts ?? []) as CaseActivity[]);
    setReminders((rems ?? []) as CaseReminder[]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  useEffect(() => { void load(); }, [caseItem.id]);

  async function uploadFile(file: File): Promise<string | null> {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `case-notes/${caseItem.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("lead-attachments").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) return null;
    const { data } = supabase.storage.from("lead-attachments").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    if (url) setAttachmentUrl(url);
    e.target.value = "";
  }

  async function addNote() {
    if (!note.trim() && !attachmentUrl) return;
    setBusy(true);
    await supabase.from("case_activities").insert({
      case_id: caseItem.id,
      type: "note",
      content: note.trim() || "(เนเธเธเธฃเธนเธ)",
      attachment_url: attachmentUrl ?? null,
      created_by: userId,
    });
    setNote("");
    setAttachmentUrl(null);
    await load();
    void onUpdated();
    setBusy(false);
  }

  async function addReminder() {
    const iso = toISO(reminderDate, reminderTime);
    if (!iso || !reminderNote.trim()) return;
    setBusy(true);
    await supabase.from("case_reminders").insert({
      case_id: caseItem.id,
      remind_at: iso,
      note: reminderNote.trim() || null,
      created_by: userId,
    });
    setReminderDate(""); setReminderTime("09:00"); setReminderNote("");
    setShowReminderForm(false);
    await load();
    void onUpdated();
    setBusy(false);
  }

  async function doneReminder(r: CaseReminder) {
    if (!completionNote.trim()) return;
    setBusy(true);
    await supabase.from("case_reminders").update({ is_done: true }).eq("id", r.id);
    const reminderLabel = r.note ? `"${r.note}"` : fmtDate(r.remind_at);
    await supabase.from("case_activities").insert({
      case_id: caseItem.id,
      type: "note",
      content: `โ… เธ—เธณเน€เธชเธฃเนเธเนเธฅเนเธง (${reminderLabel}): ${completionNote.trim()}`,
      created_by: userId,
    });
    setCompletingReminderId(null);
    setCompletionNote("");
    await load();
    void onUpdated();
    setBusy(false);
  }

  async function saveTitle() {
    if (!editTitle.trim() || editTitle === caseItem.title) { setEditingTitle(false); return; }
    await supabase.from("cases").update({ title: editTitle.trim() }).eq("id", caseItem.id);
    await onUpdated();
    setEditingTitle(false);
  }

  async function saveCustomer() {
    await supabase.from("cases").update({
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
    }).eq("id", caseItem.id);
    await onUpdated();
    setEditingCustomer(false);
  }

  async function saveFinance() {
    const banks = paymentType === "loan" ? loanBanks.map((b) => b.trim()).filter(Boolean) : [];
    await supabase.from("cases").update({
      payment_type: paymentType || null,
      loan_banks: banks,
    }).eq("id", caseItem.id);
    await onUpdated();
    setEditingFinance(false);
  }

  async function saveAssign() {
    await supabase.from("cases").update({ assigned_to: assignTo || null }).eq("id", caseItem.id);
    await supabase.from("case_activities").insert({
      case_id: caseItem.id,
      type: "status_change",
      content: `เน€เธเธฅเธตเนเธขเธเธเธนเนเธฃเธฑเธเธเธดเธ”เธเธญเธเน€เธเนเธ ${actorLabel(profiles, assignTo || null)}`,
      created_by: userId,
    });
    await Promise.all([onUpdated(), load()]);
  }

  async function requestClose() {
    setBusy(true);
    await supabase.from("cases").update({ status: "pending_close" }).eq("id", caseItem.id);
    await supabase.from("case_activities").insert({
      case_id: caseItem.id, type: "close_request",
      content: `${actorLabel(profiles, userId)} เธเธญเธเธดเธ”เน€เธเธช`, created_by: userId,
    });
    await Promise.all([onUpdated(), load()]);
    setBusy(false);
  }

  async function approveClose() {
    setBusy(true);
    await supabase.from("cases").update({ status: "closed", closed_by: userId, closed_at: new Date().toISOString() }).eq("id", caseItem.id);
    await supabase.from("case_activities").insert({
      case_id: caseItem.id, type: "closed",
      content: `${actorLabel(profiles, userId)} เธญเธเธธเธกเธฑเธ•เธดเธเธดเธ”เน€เธเธช`, created_by: userId,
    });
    await Promise.all([onUpdated(), load()]);
    setBusy(false);
  }

  async function rejectClose() {
    setBusy(true);
    await supabase.from("cases").update({ status: "active" }).eq("id", caseItem.id);
    await supabase.from("case_activities").insert({
      case_id: caseItem.id, type: "reopened",
      content: `${actorLabel(profiles, userId)} เนเธกเนเธญเธเธธเธกเธฑเธ•เธดเธเธดเธ”เน€เธเธช โ€” เน€เธเธดเธ”เนเธซเธกเน`, created_by: userId,
    });
    await Promise.all([onUpdated(), load()]);
    setBusy(false);
  }

  async function reopenCase() {
    setBusy(true);
    await supabase.from("cases").update({ status: "active", closed_by: null, closed_at: null }).eq("id", caseItem.id);
    await supabase.from("case_activities").insert({
      case_id: caseItem.id, type: "reopened",
      content: `${actorLabel(profiles, userId)} เน€เธเธดเธ”เน€เธเธชเนเธซเธกเน`, created_by: userId,
    });
    await Promise.all([onUpdated(), load()]);
    setBusy(false);
  }

  const statusBadge: Record<Case["status"], { label: string; cls: string }> = {
    active:        { label: "เธเธณเธฅเธฑเธเธ”เธณเน€เธเธดเธเธเธฒเธฃ", cls: "bg-blue-100 text-blue-700" },
    pending_close: { label: "เธฃเธญเธญเธเธธเธกเธฑเธ•เธดเธเธดเธ”",   cls: "bg-amber-100 text-amber-700" },
    closed:        { label: "เธเธดเธ”เน€เธเธชเนเธฅเนเธง",     cls: "bg-slate-100 text-slate-500" },
  };
  const badge = statusBadge[caseItem.status];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className={`border-b px-5 py-4 ${isClosed ? "bg-slate-50" : ""}`}>
          {/* Top row: icon + badge + assignee + close */}
          <div className="flex items-center gap-2">
            <BriefcaseIcon size={15} className="shrink-0 text-slate-400" />
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
            <div className="flex flex-1 items-center justify-end gap-2">
              <select
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-400 disabled:opacity-60"
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                disabled={isClosed}
              >
                <option value="">โ€” เนเธกเนเธฃเธฐเธเธธ โ€”</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                ))}
              </select>
              {assignTo !== (caseItem.assigned_to ?? "") && (
                <button onClick={() => void saveAssign()} className="shrink-0 rounded bg-brand-700 px-2 py-0.5 text-xs text-white">เธเธฑเธเธ—เธถเธ</button>
              )}
            </div>
            <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
          {/* Title */}
          {editingTitle ? (
            <div className="mt-2 flex gap-2">
              <input
                className="flex-1 rounded border border-brand-400 px-2 py-1 text-sm font-semibold outline-none"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                autoFocus
              />
              <button onClick={() => void saveTitle()} className="rounded bg-brand-700 px-2.5 py-1 text-xs text-white">เธเธฑเธเธ—เธถเธ</button>
            </div>
          ) : (
            <h2
              className="mt-1.5 cursor-pointer truncate text-base font-bold text-slate-900 hover:text-brand-700"
              title={isClosed ? "" : "เธเธฅเธดเธเน€เธเธทเนเธญเนเธเนเนเธเธเธทเนเธญ"}
              onClick={() => !isClosed && setConfirmEdit("title")}
            >
              {caseItem.title}
            </h2>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
            <span>เธชเธฃเนเธฒเธเน€เธกเธทเนเธญ {fmtDate(caseItem.created_at)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              โฑ {caseAge(caseItem.created_at)}
            </span>
          </div>
        </div>

        {/* Customer info */}
        <div className="border-b bg-slate-50 px-5 py-3">
          {editingCustomer ? (
            <div className="flex items-center gap-2">
              <input
                className="h-8 flex-1 rounded border border-slate-200 bg-white px-2 text-sm outline-none focus:border-brand-400"
                placeholder="เธเธทเนเธญเธฅเธนเธเธเนเธฒ"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                autoFocus
              />
              <input
                className="h-8 w-36 rounded border border-slate-200 bg-white px-2 text-sm outline-none focus:border-brand-400"
                placeholder="เน€เธเธญเธฃเนเนเธ—เธฃ"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                type="tel"
                onKeyDown={(e) => { if (e.key === "Enter") void saveCustomer(); if (e.key === "Escape") setEditingCustomer(false); }}
              />
              <button onClick={() => void saveCustomer()} className="shrink-0 rounded bg-brand-700 px-2.5 py-1 text-xs text-white">เธเธฑเธเธ—เธถเธ</button>
              <button onClick={() => setEditingCustomer(false)} className="text-xs text-slate-400 hover:text-slate-700">เธขเธเน€เธฅเธดเธ</button>
            </div>
          ) : (
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() => !isClosed && setConfirmEdit("customer")}
              disabled={isClosed}
            >
              <span className="text-xs text-slate-500 shrink-0">เธฅเธนเธเธเนเธฒ:</span>
              {caseItem.customer_name || caseItem.customer_phone ? (
                <span className="flex items-center gap-3 text-sm">
                  {caseItem.customer_name && <span className="font-medium text-slate-800">{caseItem.customer_name}</span>}
                  {caseItem.customer_phone && <span className="text-brand-700">{caseItem.customer_phone}</span>}
                </span>
              ) : (
                <span className="text-xs text-slate-400 italic">{isClosed ? "โ€”" : "เธเธฅเธดเธเน€เธเธทเนเธญเน€เธเธดเนเธกเธเธทเนเธญเนเธฅเธฐเน€เธเธญเธฃเนเนเธ—เธฃ"}</span>
              )}
            </button>
          )}
        </div>

        {/* Finance */}
        <div className="border-b bg-slate-50 px-5 py-3">
          {editingFinance ? (
            <div className="space-y-3">
              {/* Payment type toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 shrink-0">เธเธฃเธฐเน€เธ เธ—:</span>
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 gap-0.5">
                  {([["cash", "๐’ต เธเธทเนเธญเธชเธ”"], ["loan", "๐ฆ เธชเธดเธเน€เธเธทเนเธญ"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setPaymentType(val)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition ${paymentType === val ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {paymentType && (
                  <button onClick={() => setPaymentType("")} className="text-xs text-slate-400 hover:text-slate-700">เธฅเนเธฒเธ</button>
                )}
              </div>

              {/* Bank inputs (only when loan) */}
              {paymentType === "loan" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500">เธเธเธฒเธเธฒเธฃเธ—เธตเนเธขเธทเนเธเธชเธดเธเน€เธเธทเนเธญ (เธชเธนเธเธชเธธเธ” 4 เนเธซเนเธ)</p>
                  <datalist id="bank-list">
                    {["เธเธชเธดเธเธฃเนเธ—เธข (KBank)", "เนเธ—เธขเธเธฒเธ“เธดเธเธขเน (SCB)", "เธเธฃเธธเธเน€เธ—เธ (BBL)", "เธเธฃเธธเธเนเธ—เธข (KTB)", "เธเธฃเธธเธเธจเธฃเธต (BAY)", "เธ—เธตเธ—เธตเธเธต (TTB)", "เธญเธญเธกเธชเธดเธ (GSB)", "เธเธญเธช. (GHB)", "UOB", "CIMB"].map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <input
                        key={i}
                        list="bank-list"
                        className="h-8 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-400"
                        placeholder={`เธเธเธฒเธเธฒเธฃเธ—เธตเน ${i + 1}`}
                        value={loanBanks[i] ?? ""}
                        onChange={(e) => {
                          const next = [...loanBanks];
                          next[i] = e.target.value;
                          setLoanBanks(next);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => void saveFinance()} className="rounded bg-brand-700 px-3 py-1 text-xs font-medium text-white">เธเธฑเธเธ—เธถเธ</button>
                <button onClick={() => setEditingFinance(false)} className="text-xs text-slate-400 hover:text-slate-700">เธขเธเน€เธฅเธดเธ</button>
              </div>
            </div>
          ) : (
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() => !isClosed && setConfirmEdit("finance")}
              disabled={isClosed}
            >
              <span className="text-xs text-slate-500 shrink-0">เธชเธดเธเน€เธเธทเนเธญ:</span>
              {caseItem.payment_type === "cash" && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">๐’ต เธเธทเนเธญเธชเธ”</span>
              )}
              {caseItem.payment_type === "loan" && (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">๐ฆ เธชเธดเธเน€เธเธทเนเธญ</span>
                  {(caseItem.loan_banks ?? []).filter(Boolean).map((b) => (
                    <span key={b} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">{b}</span>
                  ))}
                </span>
              )}
              {!caseItem.payment_type && (
                <span className="text-xs text-slate-400 italic">{isClosed ? "โ€”" : "เธเธฅเธดเธเน€เธเธทเนเธญเธฃเธฐเธเธธเธเธฃเธฐเน€เธ เธ—เธเธฒเธฃเธเธณเธฃเธฐ"}</span>
              )}
            </button>
          )}
        </div>

        {/* Close workflow banners */}
        {isPendingClose && canClose && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3">
            <p className="flex-1 text-sm font-medium text-amber-800">๐“ Sales เธเธญเธเธดเธ”เน€เธเธชเธเธตเน</p>
            <button onClick={() => void approveClose()} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">เธญเธเธธเธกเธฑเธ•เธดเธเธดเธ”</button>
            <button onClick={() => void rejectClose()} disabled={busy} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">เนเธกเนเธญเธเธธเธกเธฑเธ•เธด</button>
          </div>
        )}
        {isPendingClose && !canClose && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-700">โณ เธฃเธญ Manager เธญเธเธธเธกเธฑเธ•เธดเธเธดเธ”เน€เธเธช</div>
        )}
        {isClosed && (
          <div className="flex items-center gap-3 border-b bg-slate-50 px-5 py-2.5">
            <p className="flex-1 text-sm text-slate-500">โ… เธเธดเธ”เน€เธเธชเน€เธกเธทเนเธญ {caseItem.closed_at ? fmtDate(caseItem.closed_at) : ""}</p>
            {canClose && <button onClick={() => void reopenCase()} disabled={busy} className="text-xs text-slate-500 underline hover:text-slate-800">เน€เธเธดเธ”เนเธซเธกเน</button>}
          </div>
        )}

        {/* Pending reminders */}
        {reminders.length > 0 && (
          <div className="border-b bg-yellow-50 px-5 py-3 space-y-2">
            <p className="text-xs font-semibold text-yellow-700">๐”” Reminder เธ—เธตเนเธขเธฑเธเธเนเธฒเธเธญเธขเธนเน</p>
            {reminders.map((r) => {
              const isCompleting = completingReminderId === r.id;
              return (
                <div key={r.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-yellow-800">
                    <span className="flex-1">{fmtDate(r.remind_at)}{r.note ? ` โ€” ${r.note}` : ""}</span>
                    <button
                      onClick={() => {
                        if (isCompleting) { setCompletingReminderId(null); setCompletionNote(""); }
                        else { setCompletingReminderId(r.id); setCompletionNote(""); }
                      }}
                      className={`shrink-0 ${isCompleting ? "text-slate-400" : "text-emerald-600 hover:text-emerald-800"}`}
                      title={isCompleting ? "เธขเธเน€เธฅเธดเธ" : "เธเธฑเธเธ—เธถเธเธเธฅเนเธฅเธฐเธ—เธณเน€เธชเธฃเนเธ"}
                    >
                      <CheckCircle size={14} />
                    </button>
                  </div>
                  {isCompleting && (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        className="h-8 flex-1 rounded border border-yellow-300 bg-white px-2 text-xs outline-none focus:border-brand-400"
                        placeholder="เธเธฑเธเธ—เธถเธเธเธฅเธฅเธฑเธเธเน เน€เธเนเธ เนเธ—เธฃเนเธฅเนเธง เธเธฑเธ”เธงเธฑเธเธจเธธเธเธฃเน..."
                        value={completionNote}
                        onChange={(e) => setCompletionNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void doneReminder(r); if (e.key === "Escape") { setCompletingReminderId(null); setCompletionNote(""); } }}
                      />
                      <button
                        onClick={() => void doneReminder(r)}
                        disabled={!completionNote.trim() || busy}
                        className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {busy ? "โ€ฆ" : "เธเธฑเธเธ—เธถเธ"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Activities */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {activities.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">เธขเธฑเธเนเธกเนเธกเธตเธเธฑเธเธ—เธถเธ โ€” เน€เธเธดเนเธก note เนเธฃเธเธ”เนเธฒเธเธฅเนเธฒเธ</p>
          )}
          {activities.map((act) => {
            const creatorRole = act.profiles?.role;
            const isManager = creatorRole === "admin" || creatorRole === "team_lead";
            return (
              <div
                key={act.id}
                className={`flex gap-3 rounded-xl px-3 py-2.5 ${
                  isManager
                    ? "border border-indigo-200 bg-indigo-50"
                    : "bg-white border border-slate-100"
                }`}
              >
                <span className="mt-0.5 text-base leading-none shrink-0">{typeIcon[act.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-semibold ${isManager ? "text-indigo-700" : "text-slate-700"}`}>
                      {actorLabel(profiles, act.created_by)}
                    </span>
                    {isManager && (
                      <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                        {creatorRole === "admin" ? "Admin" : "Manager"}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">{fmtDate(act.created_at)}</span>
                  </div>
                  <p className={`text-sm whitespace-pre-wrap break-words ${isManager ? "text-indigo-900" : "text-slate-800"}`}>
                    {act.content}
                  </p>
                  {act.attachment_url && (
                    <a href={act.attachment_url} target="_blank" rel="noreferrer" className="mt-2 block">
                      <img
                        src={act.attachment_url}
                        alt="เนเธเธ"
                        className="max-h-60 max-w-full rounded-lg border border-slate-200 object-contain"
                      />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        {!isClosed && (
          <div className="border-t bg-white px-5 py-4 space-y-3">

            {/* Reminder form */}
            {showReminderForm && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-700">๐”” เน€เธเธดเนเธก Reminder</p>

                {/* Date */}
                <div>
                  <label className="mb-1 block text-xs text-slate-500">เธงเธฑเธเธ—เธตเน</label>
                  <input
                    type="date"
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                  />
                </div>

                {/* Time */}
                <div>
                  <label className="mb-1 block text-xs text-slate-500">เน€เธงเธฅเธฒ</label>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                      value={reminderTime.split(":")[0]}
                      onChange={(e) => setReminderTime(`${e.target.value}:${reminderTime.split(":")[1]}`)}
                    >
                      {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
                        <option key={h} value={String(h).padStart(2, "0")}>
                          {String(h).padStart(2, "0")} เธ.
                        </option>
                      ))}
                    </select>
                    <span className="text-slate-400">:</span>
                    <select
                      className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                      value={reminderTime.split(":")[1]}
                      onChange={(e) => setReminderTime(`${reminderTime.split(":")[0]}:${e.target.value}`)}
                    >
                      {["00","15","30","45"].map((m) => (
                        <option key={m} value={m}>{m} เธเธฒเธ—เธต</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="mb-1 block text-xs text-slate-500">เธซเธกเธฒเธขเน€เธซเธ•เธธ <span className="text-rose-500">*</span></label>
                  <input
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                    placeholder="เน€เธเนเธ เนเธ—เธฃเธ•เธดเธ”เธ•เธฒเธกเน€เธฃเธทเนเธญเธเธเธนเน, เธเธฑเธ”เน€เธเนเธเธชเธฑเธเธเธฒ..."
                    value={reminderNote}
                    onChange={(e) => setReminderNote(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => void addReminder()}
                    disabled={!reminderDate || !reminderNote.trim() || busy}
                    className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    เธเธฑเธเธ—เธถเธ
                  </button>
                  <button onClick={() => setShowReminderForm(false)} className="text-xs text-slate-500 underline">
                    เธขเธเน€เธฅเธดเธ
                  </button>
                </div>
              </div>
            )}

            {/* Image preview */}
            {attachmentUrl && (
              <div className="relative inline-block">
                <img src={attachmentUrl} alt="preview" className="max-h-32 rounded-lg border border-slate-200 object-contain" />
                <button
                  onClick={() => setAttachmentUrl(null)}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white text-xs"
                >ร—</button>
              </div>
            )}
            {uploading && <p className="text-xs text-slate-400 animate-pulse">เธเธณเธฅเธฑเธเธญเธฑเธเนเธซเธฅเธ”เธฃเธนเธโ€ฆ</p>}

            {/* Note input + action buttons */}
            <div className="flex gap-2">
              <textarea
                className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
                placeholder="เธเธฑเธเธ—เธถเธ noteโ€ฆ (Enter เธชเนเธ, Shift+Enter เธเธถเนเธเธเธฃเธฃเธ—เธฑเธ”)"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addNote(); } }}
                disabled={busy}
              />
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => void addNote()}
                  disabled={(!note.trim() && !attachmentUrl) || busy}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white disabled:opacity-40"
                >
                  <Send size={14} />
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                  title="เนเธเธเธฃเธนเธ"
                >
                  <ImageIcon size={14} />
                </button>
                <button
                  onClick={() => setShowReminderForm((v) => !v)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50 ${showReminderForm ? "border-brand-400 bg-brand-50 text-brand-700" : "border-slate-200"}`}
                  title="เน€เธเธดเนเธก Reminder"
                >
                  <Bell size={14} />
                </button>
              </div>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            {/* Close request */}
            {caseItem.status === "active" && (
              <button
                onClick={() => void requestClose()}
                disabled={busy}
                className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              >
                เธเธญเธเธดเธ”เน€เธเธช
              </button>
            )}
          </div>
        )}
      </div>

      {/* Confirm edit modal */}
      {confirmEdit && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
          <div className="mx-4 w-full max-w-xs rounded-xl bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-slate-800">ต้องการแก้ไขข้อมูลใช่ไหม?</p>
            <p className="mt-1 text-xs text-slate-500">
              {confirmEdit === "title" && "แก้ไขชื่อเคส"}
              {confirmEdit === "customer" && "แก้ไขข้อมูลลูกค้า"}
              {confirmEdit === "finance" && "แก้ไขข้อมูลสินเชื่อ"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  if (confirmEdit === "title") setEditingTitle(true);
                  if (confirmEdit === "customer") setEditingCustomer(true);
                  if (confirmEdit === "finance") setEditingFinance(true);
                  setConfirmEdit(null);
                }}
                className="flex-1 rounded-lg bg-brand-700 py-2 text-sm font-medium text-white hover:bg-brand-800"
              >
                ตกลง
              </button>
              <button
                onClick={() => setConfirmEdit(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

