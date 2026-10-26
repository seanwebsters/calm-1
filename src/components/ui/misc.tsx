import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, badge }: { title: string; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-9 tracking-display text-ink">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1 max-w-2xl text-[14.5px] text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-ink-3">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
      ) : null}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-[13px] text-ink-3">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="tabular mt-0.5 text-[18px] font-semibold text-ink">{value}</div>
      {sub ? <div className="text-[12px] text-ink-4">{sub}</div> : null}
    </div>
  );
}

export function Notice({ tone = "calm", children, icon: Icon }: { tone?: "calm" | "warn" | "bad" | "neutral"; children: ReactNode; icon?: LucideIcon }) {
  const tones = { calm: "bg-calm-50 text-calm-700 border-calm-100", warn: "bg-warn-soft text-warn border-warn/15", bad: "bg-bad-soft text-bad border-bad/15", neutral: "bg-surface-sunken text-ink-2 border-line" };
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px]", tones[tone])}>
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} /> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-muted px-1.5 py-px font-mono text-[11px] text-ink-3">{children}</kbd>;
}
