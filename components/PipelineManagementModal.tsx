"use client";

import { useState } from "react";
import type { Lead, Pipeline, Profile, RecallRule, Stage, Team } from "@/types/crm";
import { addPipelineTeam, addPipelineUser, removePipelineTeam, removePipelineUser } from "@/lib/helpers";
import { pillClass } from "@/lib/helpers";
import { RecallPanel } from "@/components/RecallPanel";
import { StagesPanel } from "@/components/StagesPanel";
import { createBrowserSupabase } from "@/lib/supabase";

const supabase = createBrowserSupabase();

export function PipelineManagementModal({
  pipeline,
  stages,
  recallRules,
  teams,
  profiles,
  leads,
  userId,
  reload,
  toast,
  onClose,
}: {
  pipeline: Pipeline;
  stages: Stage[];
  recallRules: RecallRule[];
  teams: Team[];
  profiles: Profile[];
  leads: Lead[];
  userId: string;
  reload: () => Promise<void>;
  toast: (message: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"stages" | "recall" | "members" | "settings">("stages");
  const [addTeamId, setAddTeamId] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [gasUrl, setGasUrl] = useState(pipeline.gas_webhook_url ?? "");
  const [gasKey, setGasKey] = useState(pipeline.gas_project_key ?? "");
  const [savingGas, setSavingGas] = useState(false);

  async function saveGasConfig() {
    setSavingGas(true);
    try {
      const { error } = await supabase
        .from("pipelines")
        .update({ gas_webhook_url: gasUrl.trim() || null, gas_project_key: gasKey.trim() || null })
        .eq("id", pipeline.id);
      if (error) { toast(error.message); return; }
      await reload();
      toast("บันทึก GAS config แล้ว");
    } finally {
      setSavingGas(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-4">
      <section className="flex max-h-[90dvh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Manage {pipeline.name}</h2>
            <p className="text-sm text-slate-500">Stages, recall rules, teams, and direct users.</p>
          </div>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex gap-2 border-b border-slate-200 p-3">
          {(["stages", "recall", "members", "settings"] as const).map((item) => (
            <button key={item} className={pillClass(tab === item)} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto p-4">
          {tab === "stages" ? (
            <StagesPanel
              stages={stages}
              activePipelineId={pipeline.id}
              leads={leads.filter((lead) => stages.some((stage) => stage.id === lead.stage_id))}
              reload={reload}
              toast={toast}
            />
          ) : null}
          {tab === "recall" ? (
            <RecallPanel
              rules={recallRules.filter((rule) => stages.some((stage) => stage.id === rule.stage_id))}
              stages={stages}
              leads={leads.filter((lead) => stages.some((stage) => stage.id === lead.stage_id))}
              profiles={profiles}
              userId={userId}
              reload={reload}
              toast={toast}
            />
          ) : null}
          {tab === "members" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 font-semibold">Teams</h3>
                <div className="flex gap-2">
                  <select
                    className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                    value={addTeamId}
                    onChange={(event) => setAddTeamId(event.target.value)}
                  >
                    <option value="">Choose team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white"
                    onClick={() => addPipelineTeam(pipeline.id, addTeamId, reload, toast, () => setAddTeamId(""))}
                  >
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {(pipeline.pipeline_teams || []).map((item) => (
                    <div
                      key={item.team_id}
                      className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
                    >
                      {item.teams?.name ||
                        teams.find((team) => team.id === item.team_id)?.name ||
                        item.team_id}
                      <button
                        className="text-rose-600"
                        onClick={() => removePipelineTeam(pipeline.id, item.team_id, reload, toast)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 font-semibold">Direct users</h3>
                <div className="flex gap-2">
                  <select
                    className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                    value={addUserId}
                    onChange={(event) => setAddUserId(event.target.value)}
                  >
                    <option value="">Choose user</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-lg bg-brand-700 px-3 text-sm font-medium text-white"
                    onClick={() => addPipelineUser(pipeline.id, addUserId, reload, toast, () => setAddUserId(""))}
                  >
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {(pipeline.pipeline_users || []).map((item) => (
                    <div
                      key={item.user_id}
                      className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
                    >
                      {item.profiles?.full_name ||
                        item.profiles?.email ||
                        profiles.find((profile) => profile.id === item.user_id)?.email ||
                        item.user_id}
                      <button
                        className="text-rose-600"
                        onClick={() => removePipelineUser(pipeline.id, item.user_id, reload, toast)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
          {tab === "settings" ? (
            <div className="max-w-lg space-y-4">
              <div>
                <h3 className="mb-1 font-semibold text-slate-800">GAS Webhook (Voucher)</h3>
                <p className="mb-3 text-xs text-slate-500">
                  ตั้งค่า Google Apps Script Web App URL และ Project Key สำหรับออกคูปองเมื่อเลื่อน stage 🎟️
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">GAS Webhook URL</label>
                    <input
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                      placeholder="https://script.google.com/macros/s/.../exec"
                      value={gasUrl}
                      onChange={(e) => setGasUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Project Key</label>
                    <input
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm uppercase outline-none focus:border-brand-600"
                      placeholder="เช่น WELA หรือ RED_DRAGON"
                      value={gasKey}
                      onChange={(e) => setGasKey(e.target.value.toUpperCase())}
                    />
                    <p className="mt-1 text-xs text-slate-400">ต้องตรงกับ key ใน CONFIGS ของ GAS script</p>
                  </div>
                  <button
                    onClick={() => void saveGasConfig()}
                    disabled={savingGas}
                    className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {savingGas ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
