"use client";
import { cn } from "@/lib/utils";

export function Slider({ value, onChange, min = 0, max = 100, step = 1, disabled, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; label?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        "h-1.5 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-60",
        "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line-strong [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow",
        "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-line-strong [&::-moz-range-thumb]:bg-white",
      )}
      style={{ background: `linear-gradient(to right, #2F6FDE ${pct}%, #E6E9EF ${pct}%)` }}
    />
  );
}
