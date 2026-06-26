"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Profile, RecallRule, Stage } from "@/types/crm";
import { deleteRow, runRecall, toggleBoolean } from "@/lib/helpers";
import { DataTable } from "@/components/ui/DataTable";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";

const supabase = createBrowserSupabase();

export function RecallPanel({
  rules,
  stages,
  leads,
  reload,
  toast,
}: {
  rules: RecallRule[];
  stages: Stage[];
  leads: Lead[];
  profiles: Profile[];
  userId: string;
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [form, setForm] = useState({ stage_id: "", inactive_days: "3" });
  const [busy, setBusy] = useState(false);

  async function createRule() {
    if (!form.stage_id) return toast("Choose a stage");
    setBusy(true);
    try {
      const { error } = await supabase.from("auto_recall_rules").insert({
        stage_id: form.stage_id,
        inactive_days: Number(form.inactive_days || 3),
        recall_to: "pool",
        is_active: true,
      });
      if (error) {
        toast(error.message);
        return;
      }
      setForm({ stage_id: "", inactive_days: "3" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Auto recall">
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <Select
          label="Stage"
          value={form.stage_id}
          onChange={(value) => setForm({ ...form, stage_id: value })}
          options={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
        />
        <Field
          label="Inactive days"
          value={form.inactive_days}
          onChange={(value) => setForm({ ...form, inactive_days: value })}
          type="number"
        />
        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={createRule}
          >
            {busy ? "Working…" : "Create"}
          </button>
        </div>
        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-lg border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-50"
            disabled={busy}
            onClick={() => runRecall(reload, toast)}
          >
            Run now
          </button>
        </div>
      </div>
      <DataTable
        headers={["Stage", "Inactive", "Due now", "Status", "Actions"]}
        rows={rules.map((rule) => {
          const due = leads.filter(
            (lead) =>
              lead.stage_id === rule.stage_id &&
              lead.status === "active" &&
              lead.assigned_to &&
              lead.stage_entered_at &&
              new Date(lead.stage_entered_at).getTime() < Date.now() - rule.inactive_days * 86_400_000,
          ).length;
          return [
            rule.funnel_stages?.name || stages.find((stage) => stage.id === rule.stage_id)?.name || "-",
            `${rule.inactive_days} days`,
            due.toString(),
            rule.is_active ? "Active" : "Off",
            <RowActions
              key={rule.id}
              isActive={rule.is_active}
              onToggle={() =>
                toggleBoolean("auto_recall_rules", rule.id, "is_active", !rule.is_active, reload, toast)
              }
              onDelete={() => deleteRow("auto_recall_rules", rule.id, reload, toast)}
            />,
          ];
        })}
      />
    </Panel>
  );
}
