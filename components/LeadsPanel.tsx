"use client";

import { RefreshCcw } from "lucide-react";
import type { Lead, Profile } from "@/types/crm";
import { pillClass } from "@/lib/helpers";
import { IconButton } from "@/components/ui/IconButton";
import { LeadTable } from "@/components/LeadTable";

export function LeadsPanel({
  leads,
  filter,
  setFilter,
  profiles,
  filterableProfiles,
  assigneeFilter,
  setAssigneeFilter,
  onOpenLead,
  reload,
}: {
  leads: Lead[];
  filter: "active" | "unfollowed";
  setFilter: (filter: "active" | "unfollowed") => void;
  profiles: Profile[];
  filterableProfiles?: Profile[];
  assigneeFilter?: string;
  setAssigneeFilter?: (id: string) => void;
  onOpenLead: (lead: Lead) => void;
  reload: () => void;
}) {
  const canFilterByMember = !!filterableProfiles?.length && !!setAssigneeFilter;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-950">Leads</h1>
          <p className="text-sm text-slate-500">Click a lead to edit details, notes, tags, and reminders.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canFilterByMember && (
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-brand-600 focus:outline-none"
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
          )}
          <button className={pillClass(filter === "active")} onClick={() => setFilter("active")}>
            Active
          </button>
          <button className={pillClass(filter === "unfollowed")} onClick={() => setFilter("unfollowed")}>
            Unfollowed
          </button>
          <IconButton label="Reload" icon={RefreshCcw} onClick={reload} />
        </div>
      </div>
      <LeadTable leads={leads} profiles={profiles} onOpenLead={onOpenLead} />
    </section>
  );
}
