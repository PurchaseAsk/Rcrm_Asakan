"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Tag } from "@/types/crm";
import { deleteRow } from "@/lib/helpers";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";

const supabase = createBrowserSupabase();

export function TagsPanel({
  tags,
  userId,
  reload,
  toast,
}: {
  tags: Tag[];
  userId: string;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({ name: "", color: "#8b5cf6", type: "custom" });
  const [busy, setBusy] = useState(false);

  async function createTag() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("tags")
        .insert({ ...form, name: form.name.trim(), created_by: userId });
      if (error) {
        toast(error.message);
        return;
      }
      setForm({ name: "", color: "#8b5cf6", type: "custom" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Tags">
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_160px_120px]">
        <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <Field
          label="Color"
          value={form.color}
          onChange={(value) => setForm({ ...form, color: value })}
          type="color"
        />
        <Select
          label="Type"
          value={form.type}
          onChange={(value) => setForm({ ...form, type: value })}
          options={[
            { value: "custom", label: "Custom" },
            { value: "system", label: "System" },
          ]}
        />
        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={createTag}
          >
            {busy ? "Working…" : "Create"}
          </button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
              <span className="text-sm font-medium text-slate-900">{tag.name}</span>
              <span className="text-xs text-slate-500">{tag.type}</span>
            </div>
            <button className="text-sm text-rose-600" onClick={() => deleteRow("tags", tag.id, reload, toast)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
