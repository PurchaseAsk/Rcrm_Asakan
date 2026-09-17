"use client";

import { useState } from "react";
import { Archive, ChevronDown, ChevronRight } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Profile, Task } from "@/types/crm";

const supabase = createBrowserSupabase();

function priorityBadge(priority: Task["priority"]) {
  if (priority === "low")
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">ทั่วไป</span>;
  if (priority === "medium")
    return <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">ปานกลาง</span>;
  if (priority === "high")
    return <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">สำคัญ</span>;
  return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">ด่วน</span>;
}

function fmtDate(iso: string | null | undefined, red?: boolean) {
  if (!iso) return null;
  const d = new Date(iso);
  const isOverdue = red && d < new Date();
  const label = d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <span className={isOverdue ? "text-red-600 font-medium" : "text-slate-500"}>
      📅 {label}
    </span>
  );
}

function profileName(p: { full_name: string | null; email: string } | null | undefined) {
  if (!p) return "ไม่ระบุ";
  return p.full_name || p.email;
}

function TaskRow({
  task,
  tab,
  canManage,
  currentUserId,
  completingId,
  completionNote,
  saving,
  onComplete,
  onSetCompleting,
  onSetCompletionNote,
  onArchive,
  onOpenEntity,
}: {
  task: Task;
  tab: "pending" | "done";
  canManage: boolean;
  currentUserId: string;
  completingId: string | null;
  completionNote: string;
  saving: boolean;
  onComplete: (task: Task) => void;
  onSetCompleting: (id: string | null) => void;
  onSetCompletionNote: (v: string) => void;
  onArchive: (task: Task) => void;
  onOpenEntity: (entityType: string, entityId: string) => void;
}) {
  return (
    <div className={`p-4 ${tab === "done" ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {priorityBadge(task.priority)}
            <span className="text-sm font-medium text-slate-950">{task.title}</span>
          </div>

          {task.description && (
            <p className="text-xs text-slate-600">{task.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {fmtDate(task.due_at, tab === "pending")}
            <span>มอบหมายโดย {profileName(task.assigner)}</span>
          </div>

          {tab === "done" && task.completion_note && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{task.completion_note}</p>
          )}
          {tab === "done" && task.completed_at && (
            <div className="text-xs text-slate-400">
              เสร็จเมื่อ {new Date(task.completed_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          )}

          {completingId === task.id && (
            <div className="mt-2 space-y-2">
              <textarea
                rows={2}
                value={completionNote}
                onChange={(e) => onSetCompletionNote(e.target.value)}
                placeholder="บันทึกผล..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { onSetCompleting(null); onSetCompletionNote(""); }}
                  className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => onComplete(task)}
                  disabled={saving}
                  className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  บันทึก
                </button>
              </div>
            </div>
          )}
        </div>

        {completingId !== task.id && (
          <div className="flex shrink-0 items-center gap-2">
            {task.entity_type && task.entity_id && (
              <button
                onClick={() => onOpenEntity(task.entity_type!, task.entity_id!)}
                className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                เปิด{task.entity_type === "lead" ? "ลีด" : task.entity_type === "case" ? "เคส" : "แชท"}
              </button>
            )}
            {tab === "pending" && (
              <button
                onClick={() => { onSetCompleting(task.id); onSetCompletionNote(""); }}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                ทำเสร็จ ✓
              </button>
            )}
            {tab === "done" && canManage && (
              <button
                onClick={() => onArchive(task)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                จัดเก็บ
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TasksPanel({
  tasks,
  profiles,
  currentUserId,
  userRole,
  onReload,
  onOpenEntity,
}: {
  tasks: Task[];
  profiles: Profile[];
  currentUserId: string;
  userRole: string;
  onReload: () => void;
  onOpenEntity: (entityType: string, entityId: string) => void;
}) {
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [assigneeFilter, setAssigneeFilter] = useState("__all__");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const canManage = userRole === "admin" || userRole === "team_lead";

  // Separate done tasks into active (not archived) and archived
  const doneTasks = tasks.filter((t) => t.status === "done");
  const activeDoneTasks = doneTasks.filter((t) => !t.archived_at);
  const archivedTasks = doneTasks.filter((t) => !!t.archived_at);

  const filtered = tasks.filter((t) => {
    if (tab === "pending") {
      if (t.status !== "pending") return false;
    } else {
      // done tab: only non-archived
      if (t.status !== "done" || t.archived_at) return false;
    }
    if (assigneeFilter !== "__all__" && t.assigned_to !== assigneeFilter) return false;
    return true;
  });

  const filteredArchived = archivedTasks.filter((t) => {
    if (assigneeFilter !== "__all__" && t.assigned_to !== assigneeFilter) return false;
    return true;
  });

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const doneCount = activeDoneTasks.length;

  function buildGroups(taskList: Task[]) {
    const grouped: { assigneeId: string; name: string; tasks: Task[] }[] = [];
    for (const task of taskList) {
      const existing = grouped.find((g) => g.assigneeId === task.assigned_to);
      if (existing) {
        existing.tasks.push(task);
      } else {
        grouped.push({
          assigneeId: task.assigned_to,
          name: profileName(task.assignee),
          tasks: [task],
        });
      }
    }
    return grouped;
  }

  const grouped = buildGroups(filtered);
  const groupedArchived = buildGroups(filteredArchived);

  async function markDone(task: Task) {
    setSaving(true);
    try {
      await supabase
        .from("tasks")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          completion_note: completionNote.trim() || null,
        })
        .eq("id", task.id);

      const note = `งานเสร็จ: ${task.title}${completionNote.trim() ? `\n${completionNote.trim()}` : ""}`;
      if (task.entity_type === "lead" && task.entity_id) {
        await supabase.from("lead_activities").insert({
          lead_id: task.entity_id, type: "note", content: note, created_by: currentUserId,
        });
      } else if (task.entity_type === "case" && task.entity_id) {
        await supabase.from("case_activities").insert({
          case_id: task.entity_id, type: "note", content: note, created_by: currentUserId,
        });
      } else if (task.entity_type === "conversation" && task.entity_id) {
        await supabase.from("conversation_notes").insert({
          conversation_id: task.entity_id, content: note, created_by: currentUserId,
        });
      }

      setCompletingId(null);
      setCompletionNote("");
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function archiveTask(task: Task) {
    await supabase
      .from("tasks")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", task.id);
    onReload();
  }

  async function archiveAll() {
    if (activeDoneTasks.length === 0) return;
    setArchiving(true);
    try {
      const ids = activeDoneTasks.map((t) => t.id);
      await supabase
        .from("tasks")
        .update({ archived_at: new Date().toISOString() })
        .in("id", ids);
      onReload();
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex gap-1">
            <button
              onClick={() => setTab("pending")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === "pending" ? "bg-brand-700 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
            >
              ค้างอยู่ ({pendingCount})
            </button>
            <button
              onClick={() => setTab("done")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === "done" ? "bg-brand-700 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
            >
              เสร็จแล้ว ({doneCount})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {tab === "done" && canManage && doneCount > 0 && (
              <button
                onClick={() => void archiveAll()}
                disabled={archiving}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <Archive size={12} />
                จัดเก็บทั้งหมด
              </button>
            )}
            {canManage && (
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-brand-600"
              >
                <option value="__all__">ทุกคน</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {grouped.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {tab === "done" ? "ไม่มีงานที่รอตรวจสอบ" : "ไม่มีงาน"}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {grouped.map((group) => (
              <div key={group.assigneeId}>
                <div className="flex items-center gap-2 border-l-4 border-brand-500 bg-brand-50 px-4 py-2.5">
                  <span className="text-sm font-semibold text-brand-800">👤 {group.name}</span>
                  <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-xs font-bold text-brand-700">{group.tasks.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      tab={tab}
                      canManage={canManage}
                      currentUserId={currentUserId}
                      completingId={completingId}
                      completionNote={completionNote}
                      saving={saving}
                      onComplete={(t) => void markDone(t)}
                      onSetCompleting={setCompletingId}
                      onSetCompletionNote={setCompletionNote}
                      onArchive={(t) => void archiveTask(t)}
                      onOpenEntity={onOpenEntity}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Archived section — shown at bottom of done tab */}
        {tab === "done" && filteredArchived.length > 0 && (
          <div className="border-t border-slate-200">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Archive size={13} className="text-slate-400" />
              จัดเก็บแล้ว ({filteredArchived.length})
            </button>
            {showArchived && (
              <div className="divide-y divide-slate-100 opacity-60">
                {groupedArchived.map((group) => (
                  <div key={group.assigneeId}>
                    <div className="flex items-center gap-2 border-l-4 border-slate-300 bg-slate-50 px-4 py-2">
                      <span className="text-xs font-semibold text-slate-600">👤 {group.name}</span>
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-500">{group.tasks.length}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.tasks.map((task) => (
                        <div key={task.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {priorityBadge(task.priority)}
                                <span className="text-sm font-medium text-slate-700 line-through">{task.title}</span>
                              </div>
                              {task.completion_note && (
                                <p className="text-xs text-slate-500">{task.completion_note}</p>
                              )}
                              <div className="text-xs text-slate-400">
                                จัดเก็บเมื่อ {new Date(task.archived_at!).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                            {task.entity_type && task.entity_id && (
                              <button
                                onClick={() => onOpenEntity(task.entity_type!, task.entity_id!)}
                                className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              >
                                เปิด{task.entity_type === "lead" ? "ลีด" : task.entity_type === "case" ? "เคส" : "แชท"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
