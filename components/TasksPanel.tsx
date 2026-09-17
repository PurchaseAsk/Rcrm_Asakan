"use client";

import { useState } from "react";
import { X } from "lucide-react";
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

  const canManage = userRole === "admin" || userRole === "team_lead";

  const filtered = tasks.filter((t) => {
    if (t.status !== (tab === "pending" ? "pending" : "done")) return false;
    if (assigneeFilter !== "__all__" && t.assigned_to !== assigneeFilter) return false;
    return true;
  });

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  // Group by assignee
  const grouped: { assigneeId: string; name: string; tasks: Task[] }[] = [];
  for (const task of filtered) {
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

      if (task.entity_type === "lead" && task.entity_id) {
        await supabase.from("lead_activities").insert({
          lead_id: task.entity_id,
          type: "note",
          content: `งานเสร็จ: ${task.title}${completionNote.trim() ? `\n${completionNote.trim()}` : ""}`,
          created_by: currentUserId,
        });
      } else if (task.entity_type === "case" && task.entity_id) {
        await supabase.from("case_activities").insert({
          case_id: task.entity_id,
          type: "note",
          content: `งานเสร็จ: ${task.title}${completionNote.trim() ? `\n${completionNote.trim()}` : ""}`,
          created_by: currentUserId,
        });
      }

      setCompletingId(null);
      setCompletionNote("");
      onReload();
    } finally {
      setSaving(false);
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

        {grouped.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">ไม่มีงาน</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {grouped.map((group) => (
              <div key={group.assigneeId}>
                <div className="flex items-center gap-2 bg-slate-50 px-4 py-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">👤 {group.name}</span>
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">{group.tasks.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.tasks.map((task) => (
                    <div key={task.id} className={`p-4 ${tab === "done" ? "opacity-75" : ""}`}>
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
                                onChange={(e) => setCompletionNote(e.target.value)}
                                placeholder="บันทึกผล..."
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setCompletingId(null); setCompletionNote(""); }}
                                  className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                  ยกเลิก
                                </button>
                                <button
                                  onClick={() => void markDone(task)}
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
                                onClick={() => { setCompletingId(task.id); setCompletionNote(""); }}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                              >
                                ทำเสร็จ ✓
                              </button>
                            )}
                          </div>
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

    </div>
  );
}
