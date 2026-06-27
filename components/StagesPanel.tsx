"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Stage } from "@/types/crm";
import { moveStage, normalizeStagePositions, updateStage } from "@/lib/helpers";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";

const supabase = createBrowserSupabase();

export function StagesPanel({
  stages,
  activePipelineId,
  leads,
  reload,
  toast,
}: {
  stages: Stage[];
  activePipelineId: string;
  leads: Lead[];
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({ name: "", color: "#2563eb", is_unfollow: false });
  const [busy, setBusy] = useState(false);
  const orderedStages = [...stages].sort((a, b) => a.position - b.position);

  async function createStage() {
    if (!activePipelineId) return toast("Select a pipeline first");
    if (!form.name.trim()) return toast("Stage name is required");
    setBusy(true);
    try {
      const nextPosition = orderedStages.length + 1;
      const { error } = await supabase.from("funnel_stages").insert({
        name: form.name.trim(),
        color: form.color,
        is_unfollow: form.is_unfollow,
        pipeline_id: activePipelineId,
        position: nextPosition,
      });
      if (error) {
        toast(error.message);
        return;
      }
      await normalizeStagePositions(activePipelineId);
      setForm({ name: "", color: "#2563eb", is_unfollow: false });
      await reload();
      toast("Stage created");
    } finally {
      setBusy(false);
    }
  }

  async function deleteStage(stage: Stage) {
    if (leads.some((lead) => lead.stage_id === stage.id)) return toast("Cannot delete a stage that still has leads");
    const ok = window.confirm(`Delete stage "${stage.name}"?`);
    if (!ok) return;
    const { error } = await supabase.from("funnel_stages").delete().eq("id", stage.id);
    if (error) return toast(error.message);
    await normalizeStagePositions(activePipelineId);
    await reload();
    toast("Stage deleted");
  }

  return (
    <Panel title="Funnel stages">
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_140px_120px]">
        <Field
          label="Name"
          value={form.name}
          onChange={(value) => setForm({ ...form, name: value })}
          placeholder="New stage name"
        />
        <Field
          label="Color"
          value={form.color}
          onChange={(value) => setForm({ ...form, color: value })}
          type="color"
        />
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_unfollow}
            onChange={(event) => setForm({ ...form, is_unfollow: event.target.checked })}
          />
          Unfollow
        </label>
        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
            disabled={!activePipelineId || busy}
            onClick={createStage}
          >
            {busy ? "Working…" : "Create"}
          </button>
        </div>
      </div>
      <div className="grid gap-2">
        {orderedStages.map((stage, index) => (
          <div
            key={stage.id}
            className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[40px_1fr_96px_112px_110px_160px_132px]"
          >
            <div className="text-sm text-slate-500">#{index + 1}</div>
            <input
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              defaultValue={stage.name}
              onBlur={(event) => updateStage(stage.id, { name: event.target.value }, reload, toast)}
            />
            <input
              className="h-10 rounded-lg border border-slate-200 px-2"
              type="color"
              defaultValue={stage.color}
              onChange={(event) => updateStage(stage.id, { color: event.target.value }, reload, toast)}
            />
            <button
              className="rounded-lg border border-slate-200 text-sm"
              onClick={() => updateStage(stage.id, { is_unfollow: !stage.is_unfollow }, reload, toast)}
            >
              {stage.is_unfollow ? "Unfollow" : "Active"}
            </button>
            <button
              className={`rounded-lg border text-sm ${stage.is_voucher_stage ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}
              title="ส่งคูปองเมื่อเลื่อนถึง stage นี้"
              onClick={() => updateStage(stage.id, { is_voucher_stage: !stage.is_voucher_stage }, reload, toast)}
            >
              {stage.is_voucher_stage ? "🎟️ Voucher" : "🎟️"}
            </button>
            <select
              className="h-10 rounded-lg border border-slate-200 px-2 text-xs text-slate-700"
              defaultValue={stage.capi_event ?? ""}
              onChange={(e) => updateStage(stage.id, { capi_event: e.target.value || null }, reload, toast)}
            >
              <option value="">ไม่ส่ง CAPI</option>
              <option value="Lead">Lead</option>
              <option value="QualifiedLead">Qualified Lead</option>
              <option value="Schedule">Schedule</option>
            </select>
            <div className="flex items-center justify-end gap-1">
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                title="Move up"
                aria-label={`Move ${stage.name} up`}
                disabled={index === 0}
                onClick={() => moveStage(orderedStages, index, -1, reload)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                title="Move down"
                aria-label={`Move ${stage.name} down`}
                disabled={index === orderedStages.length - 1}
                onClick={() => moveStage(orderedStages, index, 1, reload)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent"
                title="Delete stage"
                aria-label={`Delete ${stage.name}`}
                disabled={leads.some((lead) => lead.stage_id === stage.id)}
                onClick={() => deleteStage(stage)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
