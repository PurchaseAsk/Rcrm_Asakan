"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Lead, Pipeline, Profile, RecallRule, Stage, Team, UnfollowReason } from "@/types/crm";
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
  unfollowReasons,
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
  unfollowReasons: UnfollowReason[];
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
  const [newReasonName, setNewReasonName] = useState("");
  const [savingReason, setSavingReason] = useState(false);

  const pipelineReasons = unfollowReasons.filter((r) => r.pipeline_id === pipeline.id);

  async function addReason() {
    if (!newReasonName.trim()) return;
    setSavingReason(true);
    try {
      const nextPos = pipelineReasons.length + 1;
      const { error } = await supabase
        .from("unfollow_reasons")
        .insert({ pipeline_id: pipeline.id, name: newReasonName.trim(), position: nextPos, created_by: userId });
      if (error) { toast(error.message); return; }
      setNewReasonName("");
      await reload();
    } finally {
      setSavingReason(false);
    }
  }

  async function deleteReason(id: string) {
    const { error } = await supabase.from("unfollow_reasons").delete().eq("id", id);
    if (error) { toast(error.message); return; }
    await reload();
  }

  async function toggleReason(reason: UnfollowReason) {
    const { error } = await supabase
      .from("unfollow_reasons")
      .update({ is_active: !reason.is_active })
      .eq("id", reason.id);
    if (error) { toast(error.message); return; }
    await reload();
  }

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
            <div className="max-w-lg space-y-6">
              {/* Unfollow reasons */}
              <div>
                <h3 className="mb-1 font-semibold text-slate-800">เหตุผลเลิกติดตาม</h3>
                <p className="mb-3 text-xs text-slate-500">
                  ตั้งค่าตัวเลือกที่จะให้ Sales เลือกเมื่อกด &quot;เลิกติดตาม&quot; lead
                </p>
                <div className="mb-3 flex gap-2">
                  <input
                    className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                    placeholder="เช่น ลีดซ้ำ / ลูกค้าไม่สนใจ / ไม่ตรงกลุ่มเป้าหมาย"
                    value={newReasonName}
                    onChange={(e) => setNewReasonName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addReason(); }}
                  />
                  <button
                    onClick={() => void addReason()}
                    disabled={savingReason || !newReasonName.trim()}
                    className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Plus size={14} />
                    เพิ่ม
                  </button>
                </div>
                {pipelineReasons.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-sm text-slate-400">
                    ยังไม่มีเหตุผล — เพิ่มด้านบน
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[...pipelineReasons].sort((a, b) => a.position - b.position).map((r) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <span className="min-w-0 flex-1 text-sm text-slate-800">{r.name}</span>
                        <button
                          onClick={() => void toggleReason(r)}
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            r.is_active
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {r.is_active ? "เปิดใช้" : "ปิด"}
                        </button>
                        <button
                          onClick={() => void deleteReason(r.id)}
                          className="shrink-0 text-slate-300 hover:text-rose-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-slate-200" />

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
