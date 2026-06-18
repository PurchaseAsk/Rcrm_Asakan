"use client";

import type { LucideIcon } from "lucide-react";

export function Metric({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{title}</span>
        <Icon size={18} className="text-brand-700" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
    </section>
  );
}
