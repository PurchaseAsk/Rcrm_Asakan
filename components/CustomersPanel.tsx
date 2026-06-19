"use client";

import { Fragment, useMemo, useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { normalizePhone, actorName } from "@/lib/helpers";
import type { Lead, Pipeline, Profile, Stage } from "@/types/crm";

type Customer = {
  key: string;
  phone: string | null;
  leads: Lead[];
};

export function CustomersPanel({
  leads,
  stages,
  pipelines,
  profiles,
  onOpenLead,
}: {
  leads: Lead[];
  stages: Stage[];
  pipelines: Pipeline[];
  profiles: Profile[];
  onOpenLead: (lead: Lead) => void;
}) {
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const customers = useMemo<Customer[]>(() => {
    const groups = new Map<string, Lead[]>();
    for (const lead of leads) {
      const norm = normalizePhone(lead.phone ?? "");
      const key = norm ?? `__nophone__${lead.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(lead);
    }
    return [...groups.entries()]
      .map(([key, ls]) => ({
        key,
        phone: ls.find((l) => l.phone)?.phone ?? null,
        leads: [...ls].sort(
          (a, b) =>
            new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
        ),
      }))
      .sort(
        (a, b) =>
          new Date(b.leads[0].last_activity_at).getTime() -
          new Date(a.leads[0].last_activity_at).getTime(),
      );
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(({ leads: ls }) =>
      ls.some((lead) =>
        [lead.customer_name, lead.phone, lead.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [customers, search]);

  function stageName(lead: Lead) {
    return stages.find((s) => s.id === lead.stage_id)?.name ?? "-";
  }
  function pipelineName(lead: Lead) {
    return pipelines.find((p) => p.id === lead.pipeline_id)?.name ?? "-";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">ทะเบียนลูกค้า</h2>
          <p className="text-sm text-slate-500">{customers.length} ลูกค้า · {leads.length} ลีด</p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ, เบอร์, อีเมล"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">ชื่อลูกค้า</th>
              <th className="px-4 py-2.5 text-left">เบอร์โทร</th>
              <th className="hidden px-4 py-2.5 text-left md:table-cell">อีเมล</th>
              <th className="hidden px-4 py-2.5 text-left lg:table-cell">Pipeline / Stage</th>
              <th className="hidden px-4 py-2.5 text-left xl:table-cell">Assigned</th>
              <th className="hidden px-4 py-2.5 text-left xl:table-cell">ล่าสุด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  ไม่พบลูกค้า
                </td>
              </tr>
            )}
            {filtered.map(({ key, leads: ls }) => {
              const latest = ls[0];
              const hasMany = ls.length > 1;
              const isExpanded = expandedKey === key;
              return (
                <Fragment key={key}>
                  <tr
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      if (hasMany) {
                        setExpandedKey(isExpanded ? null : key);
                      } else {
                        onOpenLead(latest);
                      }
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-slate-950">
                      <div className="flex items-center gap-2">
                        {latest.customer_name}
                        {hasMany && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                            {ls.length} ลีด
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{latest.phone || "-"}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {latest.email || "-"}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <span className="text-slate-500">{pipelineName(latest)}</span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span className="text-slate-800">{stageName(latest)}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 xl:table-cell">
                      {actorName(latest.assigned_to, profiles)}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-400 xl:table-cell">
                      {new Date(latest.last_activity_at).toLocaleDateString("th-TH")}
                    </td>
                  </tr>

                  {/* Expanded: show all leads for this customer */}
                  {hasMany && isExpanded &&
                    ls.map((lead) => (
                      <tr
                        key={lead.id}
                        className="cursor-pointer bg-slate-50/60 hover:bg-slate-100"
                        onClick={() => onOpenLead(lead)}
                      >
                        <td className="py-2.5 pl-10 pr-4 text-slate-700">
                          <span className="mr-2 text-slate-300">↳</span>
                          {lead.customer_name}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{lead.phone || "-"}</td>
                        <td className="hidden px-4 py-2.5 text-slate-500 md:table-cell">
                          {lead.email || "-"}
                        </td>
                        <td className="hidden px-4 py-2.5 lg:table-cell">
                          <span className="text-slate-400">{pipelineName(lead)}</span>
                          <span className="mx-1 text-slate-300">/</span>
                          <span className="text-slate-600">{stageName(lead)}</span>
                        </td>
                        <td className="hidden px-4 py-2.5 text-slate-500 xl:table-cell">
                          {actorName(lead.assigned_to, profiles)}
                        </td>
                        <td className="hidden px-4 py-2.5 text-slate-400 xl:table-cell">
                          {new Date(lead.last_activity_at).toLocaleDateString("th-TH")}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
