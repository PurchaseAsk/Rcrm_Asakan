"use client";

export function InlineCreate({
  title,
  fields,
  onSubmit,
  disabled,
}: {
  title: string;
  fields: React.ReactNode;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-950">{title}</h2>
      <div className="grid gap-3 md:grid-cols-[1fr_120px]">
        {fields}
        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-lg bg-brand-700 text-sm font-medium text-white disabled:opacity-50"
            disabled={disabled}
            onClick={onSubmit}
          >
            {disabled ? "Working…" : "Create"}
          </button>
        </div>
      </div>
    </section>
  );
}
