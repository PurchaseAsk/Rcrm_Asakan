"use client";

import type { LucideIcon } from "lucide-react";

export function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={16} />
    </button>
  );
}
