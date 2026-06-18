"use client";

import { Power, PowerOff, Trash2 } from "lucide-react";
import { ActionIconButton } from "@/components/ui/ActionIconButton";

export function RowActions({
  onToggle,
  onDelete,
  isActive,
}: {
  onToggle: () => void;
  onDelete: () => void;
  isActive?: boolean;
}) {
  const ToggleIcon = isActive === false ? PowerOff : Power;
  return (
    <div className="flex items-center gap-1.5">
      <ActionIconButton
        label={isActive === false ? "Turn on" : "Turn off"}
        icon={ToggleIcon}
        tone={isActive === false ? "muted" : "success"}
        onClick={onToggle}
      />
      <ActionIconButton label="Delete" icon={Trash2} tone="danger" onClick={onDelete} />
    </div>
  );
}
