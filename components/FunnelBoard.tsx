"use client";

import { GripVertical } from "lucide-react";
import type { Lead, Stage } from "@/types/crm";
import { EmptyLine } from "@/components/ui/EmptyLine";

export function FunnelBoard({
  stages,
  leads,
  draggedLeadId,
  setDraggedLeadId,
  onMoveLead,
  onOpenLead,
}: {
  stages: Stage[];
  leads: Lead[];
  draggedLeadId: string | null;
  setDraggedLeadId: (id: string | null) => void;
  onMoveLead: (leadId: string, stage: Stage) => Promise<void>;
  onOpenLead: (lead: Lead) => void;
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm scrollbar-thin">
      <div className="grid min-w-[640px] auto-cols-fr grid-flow-col gap-1.5">
        {stages.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);
          return (
            <div
              key={stage.id}
              className="min-w-[180px] rounded-md border border-slate-200 bg-slate-50"
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
              <div className="space-y-1.5 p-1.5">
                {stageLeads.map((lead) => (
                  <button
                    key={lead.id}
                    draggable
                    onDragStart={() => setDraggedLeadId(lead.id)}
                    onClick={() => onOpenLead(lead)}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm hover:border-brand-600"
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
                {!stageLeads.length ? <EmptyLine text="Drop leads here" /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
