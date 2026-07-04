"use client";

import { useState } from "react";
import { ChevronLeft, GripVertical, X } from "lucide-react";
import type { Lead, Profile, RecallRule, Stage } from "@/types/crm";
import { EmptyLine } from "@/components/ui/EmptyLine";

export function FunnelBoard({
  stages,
  leads,
  draggedLeadId,
  setDraggedLeadId,
  filterableProfiles,
  assigneeFilter,
  setAssigneeFilter,
  recallRules,
  onMoveLead,
  onOpenLead,
}: {
  stages: Stage[];
  leads: Lead[];
  draggedLeadId: string | null;
  setDraggedLeadId: (id: string | null) => void;
  filterableProfiles?: Profile[];
  assigneeFilter?: string;
  setAssigneeFilter?: (id: string) => void;
  recallRules?: RecallRule[];
  onMoveLead: (leadId: string, stage: Stage) => Promise<void>;
  onOpenLead: (lead: Lead) => void;
}) {
  const canFilterByMember = !!filterableProfiles?.length && !!setAssigneeFilter;
  const activeRules = (recallRules ?? []).filter((r) => r.is_active);
  const now = Date.now();
  const [moveModal, setMoveModal] = useState<{ lead: Lead } | null>(null);

  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("funnel_collapsed_stages");
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch { return new Set(); }
  });

  function toggleCollapse(stageId: string) {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId); else next.add(stageId);
      try { localStorage.setItem("funnel_collapsed_stages", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function isNearRecall(lead: Lead): boolean {
    const rule = activeRules.find((r) => r.stage_id === lead.stage_id);
    if (!rule || !lead.assigned_to) return false;
    const enteredAt = new Date(lead.stage_entered_at ?? lead.last_activity_at).getTime();
    const recallAt = enteredAt + rule.inactive_days * 86400 * 1000;
    return recallAt - now < 86400 * 1000 && recallAt > now;
  }

  return (
    <section className="space-y-2">
      {canFilterByMember && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <span className="text-sm text-slate-500">ดูลีดของ:</span>
          <select
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 focus:border-brand-600 focus:bg-white focus:outline-none sm:h-9 sm:flex-none sm:bg-white"
            value={assigneeFilter ?? ""}
            onChange={(e) => setAssigneeFilter!(e.target.value)}
          >
            <option value="">ทุกคน</option>
            <option value="__pool__">Pool (ไม่มีเจ้าของ)</option>
            {filterableProfiles!.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm md:overflow-x-auto md:scrollbar-thin">
        <div className="flex flex-col gap-3 md:flex md:min-w-[640px] md:flex-row md:items-stretch md:gap-1.5">
          {(() => {
            const knownStageIds = new Set(stages.map((s) => s.id));
            return stages.map((stage, stageIndex) => {
              const collapsed = collapsedStages.has(stage.id);
              const stageLeads = leads.filter((lead) =>
                lead.stage_id === stage.id ||
                (stageIndex === 0 && (!lead.stage_id || !knownStageIds.has(lead.stage_id))),
              );

              if (collapsed) {
                return (
                  <div
                    key={stage.id}
                    className="hidden shrink-0 cursor-pointer select-none rounded-md border border-slate-200 bg-slate-50 transition-all hover:bg-slate-100 md:flex md:w-10 md:flex-col md:items-center md:py-3"
                    onClick={() => toggleCollapse(stage.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedLeadId) void onMoveLead(draggedLeadId, stage);
                      setDraggedLeadId(null);
                    }}
                    title={`${stage.name} (${stageLeads.length}) — คลิกเพื่อขยาย`}
                  >
                    <span
                      className="mb-2 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    {stageLeads.length > 0 && (
                      <span className="mb-2 rounded-full bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">
                        {stageLeads.length}
                      </span>
                    )}
                    <span
                      className="max-h-40 overflow-hidden text-[11px] font-semibold text-slate-500"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {stage.name}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={stage.id}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 md:min-w-[180px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedLeadId) void onMoveLead(draggedLeadId, stage);
                    setDraggedLeadId(null);
                  }}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="truncate text-sm font-semibold text-slate-900">{stage.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] text-slate-600">
                        {stageLeads.length}
                      </span>
                      <button
                        onClick={() => toggleCollapse(stage.id)}
                        className="hidden rounded p-0.5 text-slate-300 transition hover:bg-slate-200 hover:text-slate-600 md:flex"
                        title="ย่อ column"
                      >
                        <ChevronLeft size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2 max-[360px]:grid-cols-2 md:block md:space-y-1.5 md:p-1.5">
                    {stageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => setDraggedLeadId(lead.id)}
                        className={`w-full min-w-0 rounded-md border shadow-sm ${isNearRecall(lead) ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}
                      >
                        <div className="flex min-w-0 items-stretch">
                          <button
                            className="flex shrink-0 cursor-grab items-center px-1.5 text-slate-300 active:cursor-grabbing md:touch-none"
                            onClick={(e) => { e.stopPropagation(); setMoveModal({ lead }); }}
                            onTouchEnd={(e) => { e.preventDefault(); setMoveModal({ lead }); }}
                            aria-label="ย้าย stage"
                          >
                            <GripVertical size={13} />
                          </button>
                          <button
                            className="min-w-0 flex-1 py-1.5 pr-2 text-left hover:opacity-80"
                            onClick={() => onOpenLead(lead)}
                          >
                            <div className="truncate text-[13px] font-medium text-slate-900">{lead.customer_name}</div>
                            <div className="truncate text-[11px] text-slate-500">
                              {lead.phone || lead.email || "No contact"}
                            </div>
                          </button>
                        </div>
                      </div>
                    ))}
                    {!stageLeads.length && (
                      <div className="col-span-full">
                        <EmptyLine text="Drop leads here" />
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Stage picker — mobile move modal */}
      {moveModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-white pb-safe sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-xs text-slate-400">ย้ายลีด</p>
                <p className="max-w-[220px] truncate font-medium text-slate-900">{moveModal.lead.customer_name}</p>
              </div>
              <button onClick={() => setMoveModal(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {stages.filter((s) => s.id !== moveModal.lead.stage_id).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setMoveModal(null); void onMoveLead(moveModal.lead.id, s); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-sm font-medium text-slate-800">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
