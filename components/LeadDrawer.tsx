"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Pipeline, Profile, Stage, Tag } from "@/types/crm";
import type { LeadDetail } from "@/types/app";
import { actorName, deleteRow, recallCountdownText, toggleLeadTag } from "@/lib/helpers";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";

const supabase = createBrowserSupabase();

type ChatSnapshot = {
  __chat_snapshot: true;
  sender_name: string;
  messages: {
    direction: "inbound" | "outbound";
    sender: string;
    content: string | null;
    attachment_url: string | null;
    attachment_type: string | null;
    time: string;
  }[];
};

export function LeadDrawer({
  lead,
  detail,
  stages,
  pipelines,
  profiles,
  tags,
  userId,
  userRole,
  requestStageChangeNote,
  onVoucherStage,
  onClose,
  reload,
  toast,
  onViewChat,
}: {
  lead: Lead;
  detail: LeadDetail;
  stages: Stage[];
  pipelines: Pipeline[];
  profiles: Profile[];
  tags: Tag[];
  userId: string;
  userRole: "admin" | "team_lead" | "staff";
  requestStageChangeNote: (stageName: string) => Promise<string | null>;
  onVoucherStage?: (stage: Stage) => void;
  onClose: () => void;
  reload: () => Promise<void>;
  toast: (message: string) => void;
  onViewChat?: () => void;
}) {
  const [form, setForm] = useState({
    customer_name: lead.customer_name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    pipeline_id: lead.pipeline_id || "",
    stage_id: lead.stage_id || "",
    assigned_to: lead.assigned_to || "",
  });
  const [note, setNote] = useState("");
  const [noteImage, setNoteImage] = useState<File | null>(null);
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  const [reminder, setReminder] = useState({ date: "", time: "09:00", note: "" });
  const [busy, setBusy] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const currentActorName = actorName(userId, profiles);

  // Staff can only change assignee if they ARE the current assignee (transfer out) or lead is unassigned
  const canChangeAssignee =
    userRole === "admin" ||
    userRole === "team_lead" ||
    !lead.assigned_to ||
    lead.assigned_to === userId;

  // Pipeline change allowed for owner, team_lead, and admin only
  const canChangePipeline =
    userRole === "admin" ||
    userRole === "team_lead" ||
    lead.assigned_to === userId;

  useEffect(() => {
    setForm({
      customer_name: lead.customer_name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      pipeline_id: lead.pipeline_id || "",
      stage_id: lead.stage_id || "",
      assigned_to: lead.assigned_to || "",
    });
    // Depend only on lead.id: reset the form when a different lead is opened,
    // but don't clobber in-progress edits when Realtime pushes a partial update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function saveLeadInfo() {
    setBusy(true);
    try {
      const pipelineChanged = form.pipeline_id !== (lead.pipeline_id || "");
      const assigneeChanged = form.assigned_to !== (lead.assigned_to || "");

      // When switching pipelines, find the first stage of the target pipeline
      let newStageId: string | null = null;
      if (pipelineChanged && form.pipeline_id) {
        const { data: firstStage } = await supabase
          .from("funnel_stages")
          .select("id")
          .eq("pipeline_id", form.pipeline_id)
          .eq("is_unfollow", false)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();
        newStageId = firstStage?.id ?? null;
      }

      const updatePayload: Record<string, unknown> = {
        customer_name: form.customer_name,
        phone: form.phone || null,
        email: form.email || null,
        assigned_to: form.assigned_to || null,
        last_activity_at: new Date().toISOString(),
      };
      if (pipelineChanged) {
        updatePayload.pipeline_id = form.pipeline_id || null;
        if (newStageId) {
          updatePayload.stage_id = newStageId;
          updatePayload.stage_entered_at = new Date().toISOString();
        }
      }

      const { error } = await supabase.from("leads").update(updatePayload).eq("id", lead.id);
      if (error) return toast(error.message);

      const activities: { lead_id: string; type: string; content: string; created_by: string }[] = [];
      if (pipelineChanged) {
        const newPipeline = pipelines.find((p) => p.id === form.pipeline_id);
        activities.push({
          lead_id: lead.id,
          type: "pipeline_change",
          content: `${currentActorName} ย้าย pipeline เป็น ${newPipeline?.name || "ไม่มี pipeline"}`,
          created_by: userId,
        });
      }
      if (assigneeChanged) {
        const nextAssignee = actorName(form.assigned_to, profiles);
        const previousAssignee = lead.assigned_to ? actorName(lead.assigned_to, profiles) : "กองกลาง";
        activities.push({
          lead_id: lead.id,
          type: "assigned",
          content: form.assigned_to
            ? `${currentActorName} มอบหมายลีดจาก ${previousAssignee} ให้ ${nextAssignee}`
            : `${currentActorName} คืนลีดจาก ${previousAssignee} กลับกองกลาง`,
          created_by: userId,
        });
      }
      if (!activities.length) {
        activities.push({
          lead_id: lead.id,
          type: "note",
          content: `${currentActorName} updated lead details`,
          created_by: userId,
        });
      }
      await supabase.from("lead_activities").insert(activities);
      await reload();
      setEditingInfo(false);
      toast("บันทึกข้อมูลลีดเรียบร้อย");
    } finally {
      setBusy(false);
    }
  }

  async function moveLeadStage() {
    setBusy(true);
    try {
      const stage = stages.find((item) => item.id === form.stage_id);
      if (!stage) {
        toast("Choose a stage");
        return;
      }
      if (lead.pipeline_id && stage.pipeline_id && stage.pipeline_id !== lead.pipeline_id) {
        toast("Stage does not belong to this lead pipeline");
        return;
      }
      if (form.stage_id === (lead.stage_id || "")) {
        toast("Stage is unchanged");
        return;
      }

      // Voucher stage: delegate to parent modal instead of normal note flow
      if (stage.is_voucher_stage && onVoucherStage) {
        onVoucherStage(stage);
        return;
      }

      const stageChangeNote = await requestStageChangeNote(stage.name);
      if (!stageChangeNote) return;

      const { error } = await supabase
        .from("leads")
        .update({
          stage_id: stage.id,
          status: stage.is_unfollow ? "unfollowed" : "active",
          last_activity_at: new Date().toISOString(),
          stage_entered_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
      if (error) {
        toast(error.message);
        return;
      }

      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        stage_id: stage.id,
        type: "stage_change",
        content: `${currentActorName} moved lead to ${stage.name}: ${stageChangeNote}`,
        created_by: userId,
      });

      if (stage.capi_event) {
        void fetch("/api/facebook/capi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: lead.id, stage_id: stage.id }),
        }).then(async (r) => {
          const data = (await r.json()) as { ok?: boolean; skipped?: boolean; reason?: string; error?: string; event?: string };
          if (data.skipped) toast(`⚠️ CAPI skipped: ${data.reason ?? "no pixel/token"}`);
          else if (data.error) toast(`❌ CAPI error: ${data.error}`);
          else if (data.ok) toast(`✅ CAPI sent: ${data.event}`);
        }).catch(() => toast("❌ CAPI: network error"));
      }

      await reload();
      toast("Stage moved");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim() && !noteImage) return;
    setBusy(true);
    try {
      let attachment_url: string | null = null;
      if (noteImage) {
        const ext = noteImage.name.split(".").pop() ?? "jpg";
        const path = `${lead.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("lead-attachments")
          .upload(path, noteImage, { upsert: false });
        if (uploadError) { toast(uploadError.message); return; }
        const { data: urlData } = supabase.storage.from("lead-attachments").getPublicUrl(path);
        attachment_url = urlData.publicUrl;
      }
      const { error } = await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        type: "note",
        content: note.trim() || null,
        attachment_url,
        created_by: userId,
      });
      if (error) { toast(error.message); return; }
      setNote("");
      setNoteImage(null);
      if (noteImageInputRef.current) noteImageInputRef.current.value = "";
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveReminder() {
    if (!reminder.date) return toast("เลือกวันที่ก่อน");
    const remind_at = `${reminder.date}T${reminder.time || "09:00"}`;
    setBusy(true);
    try {
      const { error } = await supabase.from("lead_reminders").insert({
        lead_id: lead.id,
        remind_at,
        note: reminder.note || null,
        created_by: userId,
      });
      if (error) {
        toast(error.message);
        return;
      }
      setReminder({ date: "", time: "09:00", note: "" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30">
      <aside className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{lead.customer_name}</h2>
            <p className="text-sm text-slate-500">
              {lead.page?.name || "No page"} · {recallCountdownText(lead, stages)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={
                editingInfo
                  ? "rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  : "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              }
              disabled={busy}
              onClick={() => {
                if (editingInfo) {
                  void saveLeadInfo();
                  return;
                }
                setEditingInfo(true);
              }}
            >
              {editingInfo ? "Save" : "Edit"}
            </button>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
          <section className="space-y-3">
            {/* Row 1: Name + Phone */}
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Customer name"
                value={form.customer_name}
                onChange={(value) => setForm({ ...form, customer_name: value })}
                disabled={!editingInfo}
              />
              <div className="block">
                <span className="text-xs font-medium text-slate-600">Phone</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    type="tel"
                    value={form.phone}
                    maxLength={10}
                    disabled={!editingInfo}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  {!editingInfo && form.phone && (
                    <a
                      href={`tel:${form.phone}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      title="โทรออก"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </div>
            {/* Row 2: Email + Pipeline + Assignee */}
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label="Email"
                value={form.email}
                onChange={(value) => setForm({ ...form, email: value })}
                type="email"
                disabled={!editingInfo}
              />
              <Select
                label="Pipeline"
                value={form.pipeline_id}
                onChange={(value) => setForm({ ...form, pipeline_id: value })}
                options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                allowEmpty
                emptyLabel="ไม่มี pipeline"
                disabled={!editingInfo || !canChangePipeline}
              />
              <Select
                label="Assignee"
                value={form.assigned_to}
                onChange={(value) => setForm({ ...form, assigned_to: value })}
                options={profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.full_name || profile.email,
                }))}
                allowEmpty
                emptyLabel="Pool"
                disabled={!editingInfo || !canChangeAssignee}
              />
            </div>
            {/* Row 3: Stage + Move stage button */}
            <div className="flex gap-3">
              <div className="flex-1">
                <Select
                  label="Stage"
                  value={form.stage_id}
                  onChange={(value) => setForm({ ...form, stage_id: value })}
                  options={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
                  allowEmpty
                />
              </div>
              <div className="flex items-end">
                <button
                  className="h-10 rounded-lg bg-brand-700 px-5 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={moveLeadStage}
                >
                  {busy ? "Moving..." : "Move stage"}
                </button>
              </div>
            </div>
          </section>

          {(lead.source === "facebook" || lead.metadata?.campaign_name || lead.metadata?.ad_name || lead.metadata?.adset_name) && (
            <section className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600">ข้อมูลโฆษณา</h3>
              <dl className="space-y-1 text-sm">
                {lead.facebook_conversions > 1 && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-400">Conversions</dt>
                    <dd className="font-medium text-blue-700">
                      {lead.facebook_conversions} ครั้ง
                      <span className="ml-1 text-xs text-slate-400">(ส่งฟอร์มซ้ำ)</span>
                    </dd>
                  </div>
                )}
                {lead.metadata?.campaign_name && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-400">Campaign</dt>
                    <dd className="font-medium text-slate-800">{lead.metadata.campaign_name}</dd>
                  </div>
                )}
                {lead.metadata?.adset_name && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-400">Ad Set</dt>
                    <dd className="font-medium text-slate-800">{lead.metadata.adset_name}</dd>
                  </div>
                )}
                {lead.metadata?.ad_name && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-400">Ad</dt>
                    <dd className="font-medium text-slate-800">{lead.metadata.ad_name}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = Boolean(lead.lead_tags?.some((item) => item.tag_id === tag.id));
                return (
                  <button
                    key={tag.id}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "text-white" : "border border-slate-200 text-slate-700"}`}
                    style={{ backgroundColor: active ? tag.color : "white" }}
                    onClick={() => toggleLeadTag(lead.id, tag.id, active, reload, toast)}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Notes</h3>
            <div className="flex gap-2">
              <input
                className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add note"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addNote(); } }}
              />
              <input
                ref={noteImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setNoteImage(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                title="แนบรูป"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                disabled={busy}
                onClick={() => noteImageInputRef.current?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy || (!note.trim() && !noteImage)}
                onClick={addNote}
              >
                Add
              </button>
            </div>
            {noteImage && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <img src={URL.createObjectURL(noteImage)} alt="" className="h-12 w-12 rounded object-cover" />
                <span className="flex-1 truncate text-xs text-slate-600">{noteImage.name}</span>
                <button className="text-xs text-red-500 hover:underline" onClick={() => { setNoteImage(null); if (noteImageInputRef.current) noteImageInputRef.current.value = ""; }}>ลบ</button>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Reminders</h3>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: "วันนี้", offset: 0 },
                  { label: "พรุ่งนี้", offset: 1 },
                ].map(({ label, offset }) => {
                  const d = new Date();
                  d.setDate(d.getDate() + offset);
                  const val = d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setReminder({ ...reminder, date: val })}
                      className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition ${
                        reminder.date === val
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                <input
                  className="h-8 w-36 rounded-lg border border-slate-200 px-2 text-sm"
                  type="date"
                  value={reminder.date}
                  onChange={(e) => setReminder({ ...reminder, date: e.target.value })}
                />
                <select
                  className="h-8 rounded-lg border border-slate-200 px-2 text-sm"
                  value={reminder.time}
                  onChange={(e) => setReminder({ ...reminder, time: e.target.value })}
                >
                  {Array.from({ length: 32 }, (_, i) => {
                    const h = Math.floor(i / 2) + 7;
                    const m = i % 2 === 0 ? "00" : "30";
                    const val = `${String(h).padStart(2, "0")}:${m}`;
                    return <option key={val} value={val}>{val}</option>;
                  })}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                  value={reminder.note}
                  onChange={(event) => setReminder({ ...reminder, note: event.target.value })}
                  placeholder="Reminder note"
                />
                <button
                  className="rounded-lg bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={saveReminder}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {detail.reminders.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
                >
                  <span>
                    {new Date(item.remind_at).toLocaleString("th-TH")} · {item.note || "Reminder"}
                  </span>
                  <button
                    className="text-rose-600"
                    onClick={() => deleteRow("lead_reminders", item.id, reload, toast)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Activity</h3>
            <div className="space-y-2">
              {detail.activities.map((activity) => {
                let imgSnapshot: { url: string } | null = null;
                let snapshot: ChatSnapshot | null = null;
                if (activity.content?.startsWith('{"__img_snapshot":')) {
                  try { imgSnapshot = JSON.parse(activity.content) as { url: string }; } catch { /* not JSON */ }
                } else if (activity.content?.startsWith('{"__chat_snapshot":')) {
                  try { snapshot = JSON.parse(activity.content) as ChatSnapshot; } catch { /* not JSON */ }
                }
                return (
                  <div key={activity.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MessageSquareText size={14} />
                      {actorName(activity.created_by, profiles)} · {activity.type} ·{" "}
                      {new Date(activity.created_at).toLocaleString("th-TH")}
                    </div>
                    {imgSnapshot ? (
                      <a href={imgSnapshot.url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgSnapshot.url} alt="chat snapshot" className="w-full rounded-lg border border-slate-200" />
                      </a>
                    ) : snapshot ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <div className="border-b border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                          💬 บทสนทนาล่าสุด · {snapshot.sender_name}
                        </div>
                        <div className="space-y-1.5 p-2">
                          {snapshot.messages.map((m, i) => (
                            <div key={i} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-xl px-2.5 py-1.5 text-xs ${m.direction === "outbound" ? "bg-blue-600 text-white" : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"}`}>
                                {m.direction === "inbound" && (
                                  <div className="mb-0.5 font-medium opacity-60">{m.sender}</div>
                                )}
                                {m.attachment_type === "image" && m.attachment_url ? (
                                  <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={m.attachment_url} alt="" className="max-w-[160px] rounded-lg" />
                                  </a>
                                ) : (
                                  <p className="whitespace-pre-wrap">{m.content}</p>
                                )}
                                <div className={`mt-0.5 text-right text-[10px] ${m.direction === "outbound" ? "text-blue-200" : "text-slate-400"}`}>
                                  {m.direction === "outbound" && <span className="mr-1">{m.sender}</span>}
                                  {m.time}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {activity.content && (
                          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{activity.content}</div>
                        )}
                        {activity.attachment_url && (
                          <a href={activity.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={activity.attachment_url} alt="attachment" className="max-h-60 rounded-lg border border-slate-200 object-contain" />
                          </a>
                        )}
                        {!activity.content && !activity.attachment_url && <div className="mt-1 text-sm text-slate-400">-</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
