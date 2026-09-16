"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Profile } from "@/types/crm";

const supabase = createBrowserSupabase();

export function TaskModal({
  open,
  onClose,
  onCreated,
  entityType,
  entityId,
  entityLabel,
  profiles,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  entityType?: "lead" | "case" | "conversation";
  entityId?: string;
  entityLabel?: string;
  profiles: Profile[];
  currentUserId: string;
  userRole: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !assignedTo) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("tasks").insert({
        title: title.trim(),
        description: description.trim() || null,
        assigned_by: currentUserId,
        assigned_to: assignedTo,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        priority,
        status: "pending",
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      });
      if (error) return;
      setTitle("");
      setDescription("");
      setAssignedTo("");
      setPriority("medium");
      setDueAt("");
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">มอบหมายงาน</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {entityLabel && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              <span>📎</span>
              <span>{entityLabel}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ชื่องาน *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ชื่องาน..."
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">รายละเอียดเพิ่มเติม</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">มอบหมายให้ *</label>
            <select
              required
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
            >
              <option value="">-- เลือกผู้รับงาน --</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ความสำคัญ</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
            >
              <option value="low">ทั่วไป</option>
              <option value="medium">ปานกลาง</option>
              <option value="high">สำคัญ</option>
              <option value="urgent">ด่วน</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">กำหนดส่ง</label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim() || !assignedTo}
              className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              มอบหมาย
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
