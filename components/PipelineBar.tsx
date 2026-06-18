"use client";

import type { Pipeline } from "@/types/crm";
import { pillClass } from "@/lib/helpers";

export function PipelineBar({
  pipelines,
  activePipelineId,
  onChange,
}: {
  pipelines: Pipeline[];
  activePipelineId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {pipelines.length ? (
        pipelines.map((pipeline) => (
          <button
            key={pipeline.id}
            className={pillClass(activePipelineId === pipeline.id)}
            onClick={() => onChange(pipeline.id)}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pipeline.color }} />
            {pipeline.name}
          </button>
        ))
      ) : (
        <span className="px-2 py-1 text-sm text-slate-500">No pipelines yet</span>
      )}
    </div>
  );
}
