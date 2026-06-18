"use client";

import type { LucideIcon } from "lucide-react";

export function ActionIconButton({
  label,
  icon: Icon,
  tone = "default",
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "danger" | "muted";
  onClick: () => void;
}) {
  const toneClass = {
    default:
      "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 focus:ring-slate-200",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 focus:ring-emerald-200",
    danger:
      "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 focus:ring-rose-200",
    muted:
      "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:bg-slate-100 focus:ring-slate-200",
  }[tone];

  return (
    <button
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${toneClass}`}
      onClick={onClick}
    >
      <Icon size={16} strokeWidth={2.2} />
    </button>
  );
}
