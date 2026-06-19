"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Tag } from "@/types/crm";
import { deleteRow } from "@/lib/helpers";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";

const supabase = createBrowserSupabase();

export function TagsPanel({
  tags,
  userId,
  canManage,
  reload,
  toast,
}: {
  tags: Tag[];
  userId: string;
  canManage: boolean;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({ name: "", color: "#8b5cf6" });
  const [busy, setBusy] = useState(false);

  const globalTags = tags.filter((t) => t.type === "global");

  async function createTag() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("tags")
        .insert({ ...form, name: form.name.trim(), type: "global", created_by: userId });
      if (error) {
        toast(error.message);
        return;
      }
      setForm({ name: "", color: "#8b5cf6" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Global Tags">
      {canManage && (
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_120px]">
          <Field label="ชื่อ Tag" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Field
            label="สี"
            value={form.color}
            onChange={(value) => setForm({ ...form, color: value })}
            type="color"
          />
          <div className="flex items-end">
            <button
              className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy}
              onClick={createTag}
            >
              {busy ? "Working…" : "สร้าง"}
            </button>
          </div>
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {globalTags.map((tag) => (
          <div key={tag.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
              <span className="text-sm font-medium text-slate-900">{tag.name}</span>
            </div>
            {canManage && (
              <button className="text-sm text-rose-600" onClick={() => deleteRow("tags", tag.id, reload, toast)}>
                ลบ
              </button>
            )}
          </div>
        ))}
        {globalTags.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-slate-400">ยังไม่มี Global Tag</p>
        )}
      </div>
    </Panel>
  );
}
