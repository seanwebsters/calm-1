"use client";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-surface-sunken p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg font-medium transition-all duration-150",
            size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[12.5px]",
            o.value === value ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
