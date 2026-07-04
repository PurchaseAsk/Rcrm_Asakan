"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Pipeline } from "@/types/crm";
import { deleteRow, updatePipeline } from "@/lib/helpers";
import { Field } from "@/components/ui/Field";
import { InlineCreate } from "@/components/ui/InlineCreate";

const supabase = createBrowserSupabase();

export function PipelinePanel({
  pipelines,
  leads,
  userId,
  canManage,
  reload,
  toast,
  onManage,
}: {
  pipelines: Pipeline[];
  leads: Lead[];
  userId: string;
  canManage: boolean;
  reload: () => Promise<void>;
  toast: (message: string) => void;
  onManage: (id: string) => void;
}) {
  const [form, setForm] = useState({ name: "", description: "", color: "#2563eb" });
  const [busy, setBusy] = useState(false);

  async function createPipeline() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("pipelines")
        .insert({ ...form, name: form.name.trim(), created_by: userId });
      if (error) {
        toast(error.message);
        return;
      }
      setForm({ name: "", description: "", color: "#2563eb" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <InlineCreate
          title="Create pipeline"
          fields={
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
              <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
              <Field
                label="Description"
                value={form.description}
                onChange={(value) => setForm({ ...form, description: value })}
              />
              <Field
                label="Color"
                value={form.color}
                onChange={(value) => setForm({ ...form, color: value })}
                type="color"
              />
            </div>
          }
          onSubmit={createPipeline}
          disabled={busy}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pipelines.map((pipeline) => {
          const leadCount = leads.filter((l) => l.pipeline_id === pipeline.id).length;
          return (
            <section key={pipeline.id} className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
              {/* Color strip header */}
              <div className="flex items-center gap-3 rounded-t-xl px-4 py-3" style={{ backgroundColor: pipeline.color + "18" }}>
                {canManage ? (
                  <label className="relative cursor-pointer" title="เปลี่ยนสี">
                    <span
                      className="block h-7 w-7 rounded-full border-2 border-white shadow transition-transform hover:scale-110"
                      style={{ backgroundColor: pipeline.color }}
                    />
                    <input
                      type="color"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      defaultValue={pipeline.color}
                      onChange={(e) => void updatePipeline(pipeline.id, { color: e.target.value }, reload, toast)}
                    />
                  </label>
                ) : (
                  <span className="h-7 w-7 rounded-full" style={{ backgroundColor: pipeline.color }} />
                )}
                <div className="min-w-0 flex-1">
                  {canManage ? (
                    <input
                      className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:underline"
                      defaultValue={pipeline.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value.trim() !== pipeline.name)
                          void updatePipeline(pipeline.id, { name: e.target.value.trim() }, reload, toast);
                      }}
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900">{pipeline.name}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-sm">
                  {leadCount} leads
                </span>
              </div>

              {/* Body */}
              <div className="flex flex-1 flex-col gap-3 p-4">
                {canManage ? (
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400 focus:bg-white"
                    defaultValue={pipeline.description ?? ""}
                    placeholder="คำอธิบาย pipeline..."
                    onBlur={(e) => {
                      if (e.target.value !== (pipeline.description ?? ""))
                        void updatePipeline(pipeline.id, { description: e.target.value }, reload, toast);
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">{pipeline.description || "No description"}</p>
                )}

                {canManage && (
                  <div className="flex gap-2">
                    <button
                      className="h-9 flex-1 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => onManage(pipeline.id)}
                    >
                      Manage
                    </button>
                    <button
                      className="h-9 rounded-lg px-3 text-sm font-medium text-rose-500 hover:bg-rose-50"
                      onClick={() => deleteRow("pipelines", pipeline.id, reload, toast)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
