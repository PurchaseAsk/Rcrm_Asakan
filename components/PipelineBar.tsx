"use client";

import { Search } from "lucide-react";
import type { Pipeline } from "@/types/crm";
import { pillClass } from "@/lib/helpers";

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
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {pipelines.length ? (
          <>
            {pipelines.map((pipeline) => (
              <button
                key={pipeline.id}
                className={pillClass(activePipelineId === pipeline.id)}
                onClick={() => onChange(pipeline.id)}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pipeline.color }} />
                {pipeline.name}
              </button>
            ))}
            <button
              className={pillClass(activePipelineId === "__no_pipeline__")}
              onClick={() => onChange("__no_pipeline__")}
            >
              ไม่มี Pipeline
            </button>
          </>
        ) : (
          <span className="px-2 py-1 text-sm text-slate-500">No pipelines yet</span>
        )}
      </div>
      {onSearchChange !== undefined && (
        <label className="flex w-56 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 focus-within:border-brand-600">
          <Search size={14} className="shrink-0" />
          <input
            className="w-full bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหา..."
          />
        </label>
      )}
    </div>
  );
}
