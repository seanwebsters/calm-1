import { requirePage } from "@/lib/auth/session";
import { analyticsReport, periodFromDays, type Metric } from "@/lib/analytics/metrics";
import { parseFilters, SOURCE_LABEL } from "@/lib/admin/filters";
import { cn, formatUsd } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataSourceBadge } from "@/components/ui/badge";
import { AreaSeries, HBars, LineSeries } from "@/components/admin/charts";
import { FilterBar } from "@/components/admin/filter-bar";

export const metadata = { title: "Analytics" };

function fmt(v: number | null, kind: "int" | "pct" | "usd" | "ms" | "min" | "dec"): string {
  if (v === null || Number.isNaN(v)) return "—";
  switch (kind) {
    case "int":
      return Math.round(v).toLocaleString();
    case "pct":
      return `${v.toFixed(0)}%`;
    case "usd":
      return formatUsd(v);
    case "ms":
      return `${(v / 1000).toFixed(2)}s`;
    case "min":
      return `${v.toFixed(1)} min`;
    case "dec":
      return v.toFixed(1);
  }
}

function MetricTile({ label, m, kind, invert, def }: { label: string; m: Metric; kind: Parameters<typeof fmt>[1]; invert?: boolean; def: string }) {
  const c = m.change;
  const good = c !== null && (invert ? c < -0.5 : c > 0.5);
  const bad = c !== null && (invert ? c > 0.5 : c < -0.5);
  return (
    <div className="rounded-xl border border-line bg-surface p-4" title={def}>
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="tabular mt-1 text-[20px] font-semibold tracking-display text-ink">{fmt(m.value, kind)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11.5px]">
        <span className="text-ink-4">prev {fmt(m.previous, kind)}</span>
        {c !== null && Math.abs(c) >= 0.5 ? <span className={cn("font-medium", good ? "text-good" : bad ? "text-bad" : "text-ink-3")}>{c > 0 ? "+" : ""}{c.toFixed(0)}%</span> : null}
      </div>
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("analytics.view");
  const { range, source, channels } = parseFilters(await searchParams, { range: 30 });
  const r = await analyticsReport(periodFromDays(range), channels);

  const tiles: { label: string; m: Metric; kind: Parameters<typeof fmt>[1]; invert?: boolean; def: string }[] = [
    { label: "New opted-in users", m: r.newOptedIn, kind: "int", def: "Users who completed onboarding consent in the period." },
    { label: "Daily active users", m: r.dau, kind: "int", def: "Unique users with an inbound message in the last 24h." },
    { label: "Weekly active users", m: r.wau, kind: "int", def: "Unique users active in the last 7 days." },
    { label: "Monthly active users", m: r.mau, kind: "int", def: "Unique users active in the last 30 days." },
    { label: "Messages per active user", m: r.messagesPerActiveUser, kind: "dec", def: "All messages in the period ÷ users active in the period." },
    { label: "Returning user rate", m: r.returningRate, kind: "pct", def: "Share of the period's active users who had messaged before the period." },
    { label: "Avg conversation length", m: r.avgConversationMinutes, kind: "min", def: "First to last message, conversations with 2+ messages that started in the period." },
    { label: "Avg response latency", m: r.avgLatencyMs, kind: "ms", invert: true, def: "Inbound received → AI reply ready, AI replies only." },
    { label: "AI cost per conversation", m: r.costPerConversation, kind: "usd", invert: true, def: "Estimated AI cost ÷ conversations started in the period." },
    { label: "AI cost per active user", m: r.costPerActiveUser, kind: "usd", invert: true, def: "Estimated AI cost ÷ active users." },
    { label: "Breathing exercise users", m: r.breathingEngagement, kind: "int", def: "Unique users who did a breathing exercise." },
    { label: "Sleep support users", m: r.sleepEngagement, kind: "int", def: "Unique users who used sleep support." },
    { label: "Check-in opt-out rate", m: r.checkinOptOutRate, kind: "pct", invert: true, def: "Check-in opt-outs ÷ opt-ins in the period." },
    { label: "Safety events / 1k msgs", m: r.safetyPer1000, kind: "dec", invert: true, def: "Input-layer safety flags per 1,000 inbound messages." },
    { label: "Total AI cost (est.)", m: r.totalCost, kind: "usd", invert: true, def: "Sum of estimated token cost, all purposes." },
  ];

  return (
    <>
      <PageHeader title="Analytics" description="Aggregated, privacy-conscious metrics computed from application records. Hover a tile for its definition." badge={<DataSourceBadge source={source === "production" ? "whatsapp" : source} />} actions={<FilterBar range={range} source={source} />} />
      <div className="grid grid-cols-5 gap-3">
        {tiles.map((t) => (
          <MetricTile key={t.label} {...t} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Daily active users" description={`${SOURCE_LABEL[source]} · last ${range} days`} />
          <CardBody>
            <LineSeries data={r.activeSeries} dataKey="dau" name="Active users" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="AI cost per day" description="Estimated from token usage" />
          <CardBody>
            <AreaSeries data={r.costSeries} dataKey="cost" name="Cost" unit="$" />
          </CardBody>
        </Card>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_1fr_1fr] gap-4">
        <Card>
          <CardHeader title="Tool usage" description="Successful calls in the period" />
          <CardBody>
            <HBars data={r.toolUsage.map((t) => ({ label: t.tool.replace(/_/g, " "), value: t.count, previous: t.previous }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Safety events by severity" />
          <CardBody>
            <HBars data={r.safetyBySeverity.map((s) => ({ label: s.severity, value: s.count }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Check-ins" />
          <CardBody>
            <div className="text-[12px] text-ink-3">Opt-in rate</div>
            <div className="tabular mt-1 text-[28px] font-semibold tracking-display text-ink">{r.checkinOptInRate === null ? "—" : `${r.checkinOptInRate.toFixed(0)}%`}</div>
            <p className="mt-1 text-[12px] text-ink-4">Opted-in users with at least one active check-in.</p>
            <div className="mt-4 text-[12px] text-ink-3">p95 response latency</div>
            <div className="tabular mt-1 text-[20px] font-semibold text-ink">{r.p95LatencyMs === null ? "—" : `${(r.p95LatencyMs / 1000).toFixed(2)}s`}</div>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Retention cohorts" description="Users grouped by the week they joined; cells show the % active in each following week." />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-ink-4">
                  <th className="py-2 pr-4 text-left font-medium">Cohort (week of)</th>
                  <th className="py-2 pr-4 text-right font-medium">Users</th>
                  {Array.from({ length: 6 }, (_, i) => (
                    <th key={i} className="px-1 py-2 text-center font-medium">
                      Week {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td className="py-1 pr-4 text-ink-2">{new Date(`${c.cohort}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</td>
                    <td className="tabular py-1 pr-4 text-right text-ink-2">{c.size}</td>
                    {c.weeks.map((w, i) => (
                      <td key={i} className="px-1 py-1">
                        <div
                          className={cn("tabular rounded-md py-1.5 text-center", w === null ? "text-ink-4" : w >= 55 ? "text-white" : "text-ink")}
                          style={{ background: w === null ? "transparent" : `rgba(47,111,222,${0.08 + (w / 100) * 0.84})` }}
                          title={w === null ? "No data" : `${w.toFixed(0)}% of ${c.size} active in week ${i}`}
                        >
                          {w === null ? "·" : `${w.toFixed(0)}%`}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
