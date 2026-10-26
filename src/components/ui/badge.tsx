import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "calm" | "good" | "warn" | "bad" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-2",
  calm: "bg-calm-50 text-calm-700",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  outline: "border border-line text-ink-3",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-5", tones[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Visible marker for anything that isn't production data. */
export function DataSourceBadge({ source }: { source: "demo" | "simulator" | "whatsapp" | string }) {
  if (source === "demo") return <Badge tone="warn">Demo data</Badge>;
  if (source === "simulator") return <Badge tone="calm">Simulator</Badge>;
  return null;
}
