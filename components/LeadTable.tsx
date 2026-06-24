"use client";

import type { Lead, Profile } from "@/types/crm";
import { EmptyLine } from "@/components/ui/EmptyLine";
import { formatMoney } from "@/lib/helpers";

export function LeadTable({
  leads,
  profiles = [],
  onOpenLead,
}: {
  leads: Lead[];
  profiles?: Profile[];
  onOpenLead: (lead: Lead) => void;
}) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-3">Customer</th>
            <th className="px-3 py-3">Contact</th>
            <th className="px-3 py-3">Stage</th>
            <th className="px-3 py-3">Assignee</th>
            <th className="px-3 py-3">Value</th>
            <th className="px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {leads.map((lead) => (
            <tr key={lead.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenLead(lead)}>
              <td className="px-3 py-3 font-medium text-slate-950">
                {lead.facebook_id ? (
                  <a
                    href={`https://www.facebook.com/profile.php?id=${lead.facebook_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {lead.customer_name}
                  </a>
                ) : (
                  lead.customer_name
                )}
              </td>
              <td className="px-3 py-3 text-slate-600">{lead.phone || lead.email || "-"}</td>
              <td className="px-3 py-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lead.stage?.color || "#94a3b8" }} />
                  {lead.stage?.name || "-"}
                </span>
              </td>
              <td className="px-3 py-3 text-slate-600">
                {lead.assigned?.full_name ||
                  lead.assigned?.email ||
                  profiles.find((item) => item.id === lead.assigned_to)?.full_name ||
                  "Pool"}
              </td>
              <td className="px-3 py-3 tabular-nums text-slate-700">{formatMoney(Number(lead.value || 0))}</td>
              <td className="px-3 py-3">
                <span
                  className={`rounded-full px-2 py-1 text-xs ${lead.status === "active" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {lead.status}
                </span>
              </td>
            </tr>
          ))}
          {!leads.length ? (
            <tr>
              <td colSpan={6}>
                <EmptyLine text="No leads in this view" />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
