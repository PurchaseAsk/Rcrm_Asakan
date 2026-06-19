"use client";

export function Select({
  label,
  value,
  onChange,
  options,
  allowEmpty = false,
  emptyLabel = "None",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select
        className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : <option value="">Choose</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
