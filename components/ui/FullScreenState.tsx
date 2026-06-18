"use client";

export function FullScreenState({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4 text-center">
      <div>
        <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-lg bg-brand-700" />
        <h1 className="font-semibold text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </main>
  );
}
