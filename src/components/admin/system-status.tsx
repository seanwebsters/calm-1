"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";

interface Svc {
  key: string;
  label: string;
  state: "operational" | "degraded" | "down" | "not_configured";
  detail: string;
  latencyMs: number | null;
  checkedAt: string;
}

const STATE: Record<Svc["state"], { label: string; dot: string; text: string }> = {
  operational: { label: "Operational", dot: "bg-good", text: "text-good" },
  degraded: { label: "Degraded", dot: "bg-warn", text: "text-warn" },
  down: { label: "Down", dot: "bg-bad", text: "text-bad" },
  not_configured: { label: "Not configured", dot: "bg-ink-4", text: "text-ink-3" },
};

export function SystemStatus() {
  const [services, setServices] = useState<Svc[] | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/health");
      const j = (await r.json()) as { services: Svc[] };
      setServices(j.services);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div>
      <div className="space-y-0.5">
        {(services ?? Array.from({ length: 5 }, (_, i) => null)).map((s, i) =>
          s ? (
            <div key={s.key} className="flex items-start justify-between gap-3 rounded-lg px-1 py-2" title={`${s.detail}${s.latencyMs !== null ? ` · ${s.latencyMs}ms` : ""}`}>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink">{s.label}</div>
                <div className="truncate text-[11.5px] text-ink-4">{s.detail}</div>
              </div>
              <span className={cn("flex shrink-0 items-center gap-1.5 text-[12px] font-medium", STATE[s.state].text)}>
                <span className={cn("h-2 w-2 rounded-full", STATE[s.state].dot)} />
                {STATE[s.state].label}
              </span>
            </div>
          ) : (
            <div key={i} className="my-2 h-9 animate-pulse rounded-lg bg-surface-sunken" />
          ),
        )}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2.5 text-[11.5px] text-ink-4">
        <span>{services?.[0] ? `Checked ${relativeTime(services[0].checkedAt)}` : "Checking…"}</span>
        <button onClick={load} className="flex items-center gap-1 hover:text-ink" disabled={loading}>
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Re-check
        </button>
      </div>
    </div>
  );
}
