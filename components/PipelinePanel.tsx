"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Pipeline } from "@/types/crm";
import { deleteRow } from "@/lib/helpers";
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
        {pipelines.map((pipeline) => (
          <section key={pipeline.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: pipeline.color }} />
                  <h2 className="font-semibold text-slate-950">{pipeline.name}</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">{pipeline.description || "No description"}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                {leads.filter((lead) => lead.pipeline_id === pipeline.id).length} leads
              </span>
            </div>
            {canManage ? (
              <div className="mt-4 flex gap-2">
                <button
                  className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-medium text-slate-700"
                  onClick={() => onManage(pipeline.id)}
                >
                  Manage
                </button>
                <button
                  className="h-10 rounded-lg px-3 text-sm font-medium text-rose-600"
                  onClick={() => deleteRow("pipelines", pipeline.id, reload, toast)}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
