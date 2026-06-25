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
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:p-3">
      <div className="min-w-0 flex-1 sm:hidden">
        {pipelines.length ? (
          <select
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-brand-600 focus:bg-white"
            value={activePipelineId}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Pipeline"
          >
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
            <option value="__no_pipeline__">No pipeline</option>
          </select>
        ) : (
          <span className="block rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">No pipelines yet</span>
        )}
      </div>

      <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex">
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
        <label className="flex h-11 w-full shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 focus-within:border-brand-600 focus-within:bg-white sm:h-auto sm:w-56 sm:py-1.5">
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
