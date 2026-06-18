"use client";

import { Bell, Boxes, CircleDollarSign, UserRound } from "lucide-react";
import type { DistributionRule, Lead, Pipeline } from "@/types/crm";
import { EmptyLine } from "@/components/ui/EmptyLine";
import { Metric } from "@/components/ui/Metric";
import { Panel } from "@/components/ui/Panel";
import { formatMoney } from "@/lib/helpers";
import { LeadTable } from "@/components/LeadTable";

export function Dashboard({
  leads,
  pipelines,
  rules,
}: {
  leads: Lead[];
  pipelines: Pipeline[];
  rules: DistributionRule[];
}) {
  const activeLeads = leads.filter((lead) => lead.status !== "unfollowed");
  const poolLeads = leads.filter((lead) => !lead.assigned_to);
  const value = leads.reduce((sum, lead) => sum + Number(lead.value || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Active leads" value={activeLeads.length.toLocaleString()} icon={UserRound} />
        <Metric title="Pool leads" value={poolLeads.length.toLocaleString()} icon={Bell} />
        <Metric title="Pipelines" value={pipelines.length.toLocaleString()} icon={Boxes} />
        <Metric title="Total value" value={formatMoney(value)} icon={CircleDollarSign} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Latest leads">
          <LeadTable leads={leads.slice(0, 8)} onOpenLead={() => undefined} />
        </Panel>
        <Panel title="Distribution rules">
          <div className="space-y-2">
            {rules.slice(0, 6).map((rule) => (
              <div key={rule.id} className="rounded-md border border-slate-200 p-3">
                <div className="text-sm font-medium text-slate-900">{rule.facebook_pages?.name || "No page"}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {rule.pipelines?.name || "No pipeline"} · {rule.method}
                </div>
              </div>
            ))}
            {!rules.length ? <EmptyLine text="No rules yet" /> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
