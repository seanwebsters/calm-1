import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({ label, value, change, icon: Icon, hint, footnote, invert = false }: { label: string; value: string; change: number | null; icon: LucideIcon; hint?: string; footnote?: string; invert?: boolean }) {
  const up = change !== null && change > 0.5;
  const down = change !== null && change < -0.5;
  const good = invert ? down : up;
  const bad = invert ? up : down;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card" title={hint}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-3">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-calm-50 text-calm-600">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
      <div className="tabular mt-3 text-[28px] font-semibold leading-none tracking-display text-ink">{value}</div>
      <div className="mt-3 flex items-center gap-1.5 text-[12px]">
        {change === null ? (
          <span className="text-ink-4">No prior period</span>
        ) : (
          <>
            <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium", good ? "bg-good-soft text-good" : bad ? "bg-bad-soft text-bad" : "bg-surface-sunken text-ink-3")}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : down ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {Math.abs(change).toFixed(change !== 0 && Math.abs(change) < 10 ? 1 : 0)}%
            </span>
            <span className="text-ink-4">vs previous period</span>
          </>
        )}
      </div>
      {footnote ? <div className="mt-2 text-[11.5px] text-ink-4">{footnote}</div> : null}
    </div>
  );
}
