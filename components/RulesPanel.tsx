"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { DistributionRule, Page, Pipeline, Profile, Team } from "@/types/crm";
import type { RuleForm } from "@/types/app";
import { deleteRow, toggleRule, userIdsLabel } from "@/lib/helpers";
import { DataTable } from "@/components/ui/DataTable";
import { IconButton } from "@/components/ui/IconButton";
import { Panel } from "@/components/ui/Panel";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";

const supabase = createBrowserSupabase();

function RuleCellSelect({
  label,
  value,
  onChange,
  options,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  return (
    <select
      aria-label={label}
      className="h-9 min-w-[150px] rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-brand-600"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {allowEmpty ? <option value="">None</option> : <option value="">Choose</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function buildRulePayload(form: RuleForm, toast: (message: string) => void) {
  if (!form.page_id) {
    toast("Choose a page");
    return null;
  }
  const payload: Record<string, unknown> = {
    page_id: form.page_id,
    pipeline_id: form.pipeline_id || null,
    team_id: null,
    method: form.method,
    config: {},
  };
  if (form.assign_type === "team") {
    if (!form.team_id) {
      toast("Choose a team");
      return null;
    }
    payload.team_id = form.team_id;
  } else {
    if (!form.user_id) {
      toast("Choose a user");
      return null;
    }
    payload.config = { user_ids: [form.user_id] };
  }
  return payload;
}

export function RulesPanel({
  rules,
  pages,
  teams,
  pipelines,
  profiles,
  reload,
  toast,
}: {
  rules: DistributionRule[];
  pages: Page[];
  teams: Team[];
  pipelines: Pipeline[];
  profiles: Profile[];
  reload: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const emptyRuleForm: RuleForm = {
    page_id: "",
    pipeline_id: "",
    assign_type: "team",
    team_id: "",
    user_id: "",
    method: "round_robin",
  };
  const [form, setForm] = useState<RuleForm>(emptyRuleForm);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RuleForm>(emptyRuleForm);
  const [busy, setBusy] = useState(false);

  async function createRule() {
    if (!form.page_id) return toast("Choose a page");
    const payload = buildRulePayload(form, toast);
    if (!payload) return;
    payload.is_active = true;
    setBusy(true);
    try {
      const { error } = await supabase.from("distribution_rules").insert(payload);
      if (error) {
        toast(error.message);
        return;
      }
      setForm(emptyRuleForm);
      await reload();
      toast("Rule created");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(rule: DistributionRule) {
    const userId = rule.config?.user_ids?.[0] || "";
    setEditingRuleId(rule.id);
    setEditForm({
      page_id: rule.page_id || "",
      pipeline_id: rule.pipeline_id || "",
      assign_type: userId ? "user" : "team",
      team_id: rule.team_id || "",
      user_id: userId,
      method: rule.method,
    });
  }

  async function saveRule(ruleId: string) {
    const payload = buildRulePayload(editForm, toast);
    if (!payload) return;
    const { error } = await supabase.from("distribution_rules").update(payload).eq("id", ruleId);
    if (error) return toast(error.message);
    setEditingRuleId(null);
    await reload();
    toast("Rule updated");
  }

  return (
    <Panel title="Distribution rules">
      <div className="mb-4 grid gap-2 lg:grid-cols-6">
        <Select
          label="Page"
          value={form.page_id}
          onChange={(value) => setForm({ ...form, page_id: value })}
          options={pages.map((page) => ({ value: page.id, label: page.name }))}
        />
        <Select
          label="Pipeline"
          value={form.pipeline_id}
          onChange={(value) => setForm({ ...form, pipeline_id: value })}
          options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
          allowEmpty
        />
        <Select
          label="Assign"
          value={form.assign_type}
          onChange={(value) => setForm({ ...form, assign_type: value })}
          options={[
            { value: "team", label: "Team" },
            { value: "user", label: "User" },
          ]}
        />
        {form.assign_type === "team" ? (
          <Select
            label="Team"
            value={form.team_id}
            onChange={(value) => setForm({ ...form, team_id: value })}
            options={teams.map((team) => ({ value: team.id, label: team.name }))}
          />
        ) : (
          <Select
            label="User"
            value={form.user_id}
            onChange={(value) => setForm({ ...form, user_id: value })}
            options={profiles.map((profile) => ({ value: profile.id, label: profile.full_name || profile.email }))}
          />
        )}
        <Select
          label="Method"
          value={form.method}
          onChange={(value) => setForm({ ...form, method: value })}
          options={[
            { value: "round_robin", label: "Round robin" },
            { value: "random", label: "Random" },
          ]}
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
      </div>
      <DataTable
        headers={["Page", "Pipeline", "Target", "Method", "Status", "Actions"]}
        rows={rules.map((rule) => {
          const isEditing = editingRuleId === rule.id;
          return [
            isEditing ? (
              <RuleCellSelect
                label="Page"
                value={editForm.page_id}
                onChange={(value) => setEditForm({ ...editForm, page_id: value })}
                options={pages.map((page) => ({ value: page.id, label: page.name }))}
              />
            ) : (
              rule.facebook_pages?.name || pages.find((page) => page.id === rule.page_id)?.name || "-"
            ),
            isEditing ? (
              <RuleCellSelect
                label="Pipeline"
                value={editForm.pipeline_id}
                onChange={(value) => setEditForm({ ...editForm, pipeline_id: value })}
                options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
                allowEmpty
              />
            ) : (
              rule.pipelines?.name ||
                pipelines.find((pipeline) => pipeline.id === rule.pipeline_id)?.name ||
                "-"
            ),
            isEditing ? (
              <div className="grid min-w-[260px] gap-2 sm:grid-cols-2">
                <RuleCellSelect
                  label="Assign"
                  value={editForm.assign_type}
                  onChange={(value) => setEditForm({ ...editForm, assign_type: value })}
                  options={[
                    { value: "team", label: "Team" },
                    { value: "user", label: "User" },
                  ]}
                />
                {editForm.assign_type === "team" ? (
                  <RuleCellSelect
                    label="Team"
                    value={editForm.team_id}
                    onChange={(value) => setEditForm({ ...editForm, team_id: value })}
                    options={teams.map((team) => ({ value: team.id, label: team.name }))}
                  />
                ) : (
                  <RuleCellSelect
                    label="User"
                    value={editForm.user_id}
                    onChange={(value) => setEditForm({ ...editForm, user_id: value })}
                    options={profiles.map((profile) => ({
                      value: profile.id,
                      label: profile.full_name || profile.email,
                    }))}
                  />
                )}
              </div>
            ) : (
              rule.teams?.name ||
                teams.find((team) => team.id === rule.team_id)?.name ||
                userIdsLabel(rule.config?.user_ids, profiles)
            ),
            isEditing ? (
              <RuleCellSelect
                label="Method"
                value={editForm.method}
                onChange={(value) => setEditForm({ ...editForm, method: value })}
                options={[
                  { value: "round_robin", label: "Round robin" },
                  { value: "random", label: "Random" },
                ]}
              />
            ) : (
              rule.method
            ),
            rule.is_active ? "Active" : "Off",
            isEditing ? (
              <div key={rule.id} className="flex gap-2">
                <IconButton label="Save rule" icon={Check} onClick={() => saveRule(rule.id)} />
                <IconButton label="Cancel edit" icon={X} onClick={() => setEditingRuleId(null)} />
              </div>
            ) : (
              <div key={rule.id} className="flex gap-2">
                <IconButton label="Edit rule" icon={Pencil} onClick={() => startEdit(rule)} />
                <RowActions
                  isActive={rule.is_active}
                  onToggle={() => toggleRule(rule, reload, toast)}
                  onDelete={() => deleteRow("distribution_rules", rule.id, reload, toast)}
                />
              </div>
            ),
          ];
        })}
      />
    </Panel>
  );
}
