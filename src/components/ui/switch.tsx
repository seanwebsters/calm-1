"use client";
import { cn } from "@/lib/utils";

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50", checked ? "bg-calm-500" : "bg-line-strong")}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}
