"use client";

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h1 className="mb-4 text-lg font-semibold text-slate-950">{title}</h1>
      {children}
    </section>
  );
}
