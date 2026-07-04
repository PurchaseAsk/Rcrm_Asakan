"use client";

import { Search } from "lucide-react";
import type { Pipeline } from "@/types/crm";

export function PipelineBar({
  pipelines,
  activePipelineId,
  onChange,
  search,
  onSearchChange,
}: {
  pipelines: Pipeline[];
  activePipelineId: string;
  onChange: (id: string) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
}) {
  const tabs = [
    ...pipelines.map((p) => ({ id: p.id, label: p.name, color: p.color })),
    { id: "__no_pipeline__", label: "ไม่มี Pipeline", color: "#94a3b8" },
  ];

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80">
      {/* Mobile: select */}
      <div className="min-w-0 flex-1 sm:hidden">
        <select
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-brand-600"
          value={activePipelineId}
          onChange={(e) => onChange(e.target.value)}
        >
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop: segmented control */}
      <div className="hidden min-w-0 flex-1 sm:block">
        {pipelines.length ? (
          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {tabs.map((tab) => {
              const active = activePipelineId === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onChange(tab.id)}
                  className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all duration-150 ${
                    active
                      ? "text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  style={active ? { backgroundColor: tab.color } : undefined}
                >
                  {!active && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tab.color }}
                    />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="px-3 text-sm text-slate-400">ยังไม่มี pipeline</span>
        )}
      </div>

      {/* Search */}
      {onSearchChange !== undefined && (
        <label className="flex h-9 w-44 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 transition-colors focus-within:border-brand-400 focus-within:bg-white focus-within:text-brand-600">
          <Search size={13} className="shrink-0" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหา..."
          />
        </label>
      )}
    </div>
  );
}
