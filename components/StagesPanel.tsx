"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Settings, Trash2, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Lead, Stage, StageQuestion, StageQuestionType, StageRule } from "@/types/crm";
import { moveStage, normalizeStagePositions, updateStage } from "@/lib/helpers";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";

const supabase = createBrowserSupabase();

const TYPE_LABELS: Record<StageQuestionType, string> = {
  text: "ข้อความ",
  radio: "เลือก 1",
  checkbox: "เลือกได้หลาย",
  date: "วันที่",
};

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

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

  // Stage Rule Editor state
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [questions, setQuestions] = useState<StageQuestion[]>([]);
  const [ruleLoading, setRuleLoading] = useState(false);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [draftQ, setDraftQ] = useState<{ label: string; type: StageQuestionType; options: string }>({
    label: "", type: "text", options: "",
  });

  async function openRuleEditor(stage: Stage) {
    setEditingStage(stage);
    setRuleLoading(true);
    setQuestions([]);
    const { data } = await supabase
      .from("stage_rules")
      .select("id, stage_id, questions")
      .eq("stage_id", stage.id)
      .maybeSingle();
    if (data) {
      setQuestions((data as StageRule).questions ?? []);
    }
    setRuleLoading(false);
    setDraftQ({ label: "", type: "text", options: "" });
  }

  function addQuestion() {
    if (!draftQ.label.trim()) return;
    const opts = draftQ.options
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const newQ: StageQuestion = {
      id: genId(),
      label: draftQ.label.trim(),
      type: draftQ.type,
      options: ["radio", "checkbox"].includes(draftQ.type) ? opts : undefined,
    };
    setQuestions((prev) => [...prev, newQ]);
    setDraftQ({ label: "", type: "text", options: "" });
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  async function saveRule() {
    if (!editingStage) return;
    setRuleSaving(true);
    try {
      if (questions.length === 0) {
        await supabase.from("stage_rules").delete().eq("stage_id", editingStage.id);
      } else {
        await supabase.from("stage_rules").upsert(
          { stage_id: editingStage.id, questions },
          { onConflict: "stage_id" },
        );
      }
      toast("บันทึก rule แล้ว");
      setEditingStage(null);
    } finally {
      setRuleSaving(false);
    }
  }

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
      if (error) { toast(error.message); return; }
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
        <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="New stage name" />
        <Field label="Color" value={form.color} onChange={(value) => setForm({ ...form, color: value })} type="color" />
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_unfollow} onChange={(event) => setForm({ ...form, is_unfollow: event.target.checked })} />
          Unfollow
        </label>
        <div className="flex items-end">
          <button className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50" disabled={!activePipelineId || busy} onClick={createStage}>
            {busy ? "Working…" : "Create"}
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {orderedStages.map((stage, index) => (
          <div key={stage.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[40px_1fr_96px_112px_110px_160px_172px]">
            <div className="text-sm text-slate-500">#{index + 1}</div>
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" defaultValue={stage.name} onBlur={(event) => updateStage(stage.id, { name: event.target.value }, reload, toast)} />
            <input className="h-10 rounded-lg border border-slate-200 px-2" type="color" defaultValue={stage.color} onChange={(event) => updateStage(stage.id, { color: event.target.value }, reload, toast)} />
            <button className="rounded-lg border border-slate-200 text-sm" onClick={() => updateStage(stage.id, { is_unfollow: !stage.is_unfollow }, reload, toast)}>
              {stage.is_unfollow ? "Unfollow" : "Active"}
            </button>
            <button className={`rounded-lg border text-sm ${stage.is_voucher_stage ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`} onClick={() => updateStage(stage.id, { is_voucher_stage: !stage.is_voucher_stage }, reload, toast)}>
              {stage.is_voucher_stage ? "🎟️ Voucher" : "🎟️"}
            </button>
            <select className="h-10 rounded-lg border border-slate-200 px-2 text-xs text-slate-700" defaultValue={stage.capi_event ?? ""} onChange={(e) => updateStage(stage.id, { capi_event: e.target.value || null }, reload, toast)}>
              <option value="">ไม่ส่ง CAPI</option>
              <option value="Lead">Lead</option>
              <option value="QualifiedLead">Qualified Lead</option>
              <option value="Schedule">Schedule</option>
            </select>
            <div className="flex items-center justify-end gap-1">
              <button className="flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-50" onClick={() => void openRuleEditor(stage)} title="ตั้งค่า Stage Rule">
                <Settings size={13} />
                <span className="hidden sm:inline">Rule</span>
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300" disabled={index === 0} onClick={() => moveStage(orderedStages, index, -1, reload)}>
                <ArrowUp size={16} />
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300" disabled={index === orderedStages.length - 1} onClick={() => moveStage(orderedStages, index, 1, reload)}>
                <ArrowDown size={16} />
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent" disabled={leads.some((lead) => lead.stage_id === stage.id)} onClick={() => deleteStage(stage)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Stage Rule Editor Modal */}
      {editingStage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" style={{ maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">Stage Rule</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: editingStage.color }} />
                  {editingStage.name}
                </p>
              </div>
              <button onClick={() => setEditingStage(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {ruleLoading ? (
                <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด…</p>
              ) : (
                <>
                  {/* Existing questions */}
                  {questions.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">ยังไม่มี field — เพิ่มด้านล่าง</p>
                  ) : (
                    <div className="space-y-2">
                      {questions.map((q, i) => (
                        <div key={q.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-400">#{i + 1}</span>
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">{TYPE_LABELS[q.type]}</span>
                            </div>
                            <p className="mt-1 text-sm font-medium text-slate-800">{q.label}</p>
                            {q.options && q.options.length > 0 && (
                              <p className="mt-0.5 text-xs text-slate-400">{q.options.join(" · ")}</p>
                            )}
                          </div>
                          <button onClick={() => removeQuestion(q.id)} className="mt-1 text-slate-300 hover:text-rose-500">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add question form */}
                  <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">+ เพิ่ม field</p>
                    <input
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                      placeholder="คำถาม / ชื่อ field เช่น ส่งคูปองแล้วหรือยัง"
                      value={draftQ.label}
                      onChange={(e) => setDraftQ((d) => ({ ...d, label: e.target.value }))}
                    />
                    <select
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-brand-600"
                      value={draftQ.type}
                      onChange={(e) => setDraftQ((d) => ({ ...d, type: e.target.value as StageQuestionType }))}
                    >
                      <option value="text">ข้อความ (กรอกอิสระ)</option>
                      <option value="radio">เลือก 1 ตัวเลือก</option>
                      <option value="checkbox">เลือกได้หลายตัวเลือก</option>
                      <option value="date">วันที่</option>
                    </select>
                    {(draftQ.type === "radio" || draftQ.type === "checkbox") && (
                      <input
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
                        placeholder="ตัวเลือก คั่นด้วย comma เช่น ใช่, ยังไม่ได้, ไม่แน่ใจ"
                        value={draftQ.options}
                        onChange={(e) => setDraftQ((d) => ({ ...d, options: e.target.value }))}
                      />
                    )}
                    <button
                      onClick={addQuestion}
                      disabled={!draftQ.label.trim()}
                      className="h-9 w-full rounded-lg bg-slate-800 text-sm font-medium text-white disabled:opacity-40"
                    >
                      เพิ่ม field
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
              <p className="text-xs text-slate-400">
                {questions.length === 0 ? "ไม่มี rule — ใช้ช่อง note ปกติ" : `${questions.length} field`}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setEditingStage(null)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600">
                  ยกเลิก
                </button>
                <button
                  onClick={() => void saveRule()}
                  disabled={ruleSaving || ruleLoading}
                  className="h-9 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {ruleSaving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
