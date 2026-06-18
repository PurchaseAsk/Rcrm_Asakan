"use client";

import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Profile, Stage, Tag } from "@/types/crm";
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
  profiles,
  tags,
  userId,
  requestStageChangeNote,
  onClose,
  reload,
  toast,
}: {
  lead: Lead;
  detail: LeadDetail;
  stages: Stage[];
  profiles: Profile[];
  tags: Tag[];
  userId: string;
  requestStageChangeNote: (stageName: string) => Promise<string | null>;
  onClose: () => void;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({
    customer_name: lead.customer_name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    value: String(lead.value || 0),
    stage_id: lead.stage_id || "",
    assigned_to: lead.assigned_to || "",
  });
  const [note, setNote] = useState("");
  const [reminder, setReminder] = useState({ remind_at: "", note: "" });
  const [busy, setBusy] = useState(false);
  const currentActorName = actorName(userId, profiles);

  useEffect(() => {
    setForm({
      customer_name: lead.customer_name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      value: String(lead.value || 0),
      stage_id: lead.stage_id || "",
      assigned_to: lead.assigned_to || "",
    });
    // Depend only on lead.id: reset the form when a different lead is opened,
    // but don't clobber in-progress edits when Realtime pushes a partial update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function saveLead() {
    setBusy(true);
    try {
      const stage = stages.find((item) => item.id === form.stage_id);
      // Guard: prevent saving a stage that belongs to a different pipeline than the lead.
      if (stage && lead.pipeline_id && stage.pipeline_id && stage.pipeline_id !== lead.pipeline_id) {
        toast("Stage ไม่ตรงกับ Pipeline ของลีดนี้ กรุณาเลือก Stage ใหม่");
        return;
      }
      const stageChanged = form.stage_id !== (lead.stage_id || "");
      const assigneeChanged = form.assigned_to !== (lead.assigned_to || "");
      const stageChangeNote = stageChanged
        ? await requestStageChangeNote(stage?.name || "selected stage")
        : null;
      if (stageChanged && !stageChangeNote) return;

      const { error } = await supabase
        .from("leads")
        .update({
          customer_name: form.customer_name,
          phone: form.phone || null,
          email: form.email || null,
          value: Number(form.value || 0),
          stage_id: form.stage_id || null,
          assigned_to: form.assigned_to || null,
          status: stage?.is_unfollow ? "unfollowed" : "active",
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
      if (error) return toast(error.message);

      const activities: { lead_id: string; type: string; content: string; created_by: string }[] = [];
      if (stageChanged) {
        activities.push({
          lead_id: lead.id,
          type: "stage_change",
          content: `${currentActorName} moved lead to ${stage?.name || "new stage"}: ${stageChangeNote}`,
          created_by: userId,
        });
      }
      if (assigneeChanged) {
        const nextAssignee = actorName(form.assigned_to, profiles);
        const previousAssignee = lead.assigned_to ? actorName(lead.assigned_to, profiles) : "central pool";
        activities.push({
          lead_id: lead.id,
          type: "assigned",
          content: form.assigned_to
            ? `${currentActorName} assigned lead from ${previousAssignee} to ${nextAssignee}`
            : `${currentActorName} returned lead from ${previousAssignee} to central pool`,
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
      toast("Lead saved");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        type: "note",
        content: note.trim(),
        created_by: userId,
      });
      if (error) {
        toast(error.message);
        return;
      }
      setNote("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveReminder() {
    if (!reminder.remind_at) return toast("Choose reminder time");
    setBusy(true);
    try {
      const { error } = await supabase.from("lead_reminders").insert({
        lead_id: lead.id,
        remind_at: reminder.remind_at,
        note: reminder.note || null,
        created_by: userId,
      });
      if (error) {
        toast(error.message);
        return;
      }
      setReminder({ remind_at: "", note: "" });
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
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
          <section className="grid gap-3 md:grid-cols-2">
            <Field
              label="Customer name"
              value={form.customer_name}
              onChange={(value) => setForm({ ...form, customer_name: value })}
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={(value) => setForm({ ...form, phone: value })}
            />
            <Field
              label="Email"
              value={form.email}
              onChange={(value) => setForm({ ...form, email: value })}
              type="email"
            />
            <Field
              label="Value"
              value={form.value}
              onChange={(value) => setForm({ ...form, value })}
              type="number"
            />
            <Select
              label="Stage"
              value={form.stage_id}
              onChange={(value) => setForm({ ...form, stage_id: value })}
              options={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
              allowEmpty
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
            />
            <button
              className="h-10 rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50 md:col-span-2"
              disabled={busy}
              onClick={saveLead}
            >
              {busy ? "Saving…" : "Save lead"}
            </button>
          </section>

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
              />
              <button
                className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy}
                onClick={addNote}
              >
                Add
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-950">Reminders</h3>
            <div className="grid gap-2 md:grid-cols-[180px_1fr_90px]">
              <input
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                type="datetime-local"
                value={reminder.remind_at}
                onChange={(event) => setReminder({ ...reminder, remind_at: event.target.value })}
              />
              <input
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                value={reminder.note}
                onChange={(event) => setReminder({ ...reminder, note: event.target.value })}
                placeholder="Reminder note"
              />
              <button
                className="rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy}
                onClick={saveReminder}
              >
                Save
              </button>
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
                      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{activity.content || "-"}</div>
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
