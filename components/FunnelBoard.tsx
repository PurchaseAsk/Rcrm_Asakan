"use client";

import { GripVertical } from "lucide-react";
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
        <div className="flex flex-col gap-3 md:grid md:min-w-[640px] md:auto-cols-fr md:grid-flow-col md:gap-1.5">
          {stages.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);
            return (
              <div
                key={stage.id}
                className="rounded-md border border-slate-200 bg-slate-50 md:min-w-[180px]"
                onDragOver={(event) => event.preventDefault()}
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
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] text-slate-600">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 p-2 max-[360px]:grid-cols-2 md:block md:space-y-1.5 md:p-1.5">
                  {stageLeads.map((lead) => (
                    <button
                      key={lead.id}
                      draggable
                      onDragStart={() => setDraggedLeadId(lead.id)}
                      onClick={() => onOpenLead(lead)}
                      className={`w-full min-w-0 rounded-md border px-2 py-1.5 text-left shadow-sm hover:border-brand-600 ${isNearRecall(lead) ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <GripVertical size={13} className="shrink-0 text-slate-300" />
                        <div className="truncate text-[13px] font-medium text-slate-900">{lead.customer_name}</div>
                      </div>
                      <div className="mt-0.5 truncate pl-5 text-[11px] text-slate-500">
                        {lead.phone || lead.email || "No contact"}
                      </div>
                    </button>
                  ))}
                  {!stageLeads.length ? (
                    <div className="col-span-full">
                      <EmptyLine text="Drop leads here" />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
