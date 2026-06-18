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
  onOpenLead,
  reload,
}: {
  leads: Lead[];
  filter: "active" | "unfollowed";
  setFilter: (filter: "active" | "unfollowed") => void;
  profiles: Profile[];
  onOpenLead: (lead: Lead) => void;
  reload: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-950">Leads</h1>
          <p className="text-sm text-slate-500">Click a lead to edit details, notes, tags, and reminders.</p>
        </div>
        <div className="flex items-center gap-2">
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
