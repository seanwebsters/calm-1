import Link from "next/link";
import { Bell, Bot, CircleDollarSign, FileText, Library, MessageCircle, Repeat, ShieldCheck, UserCheck, Users } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { overviewMetrics, periodFromDays } from "@/lib/analytics/metrics";
import { parseFilters, SOURCE_LABEL } from "@/lib/admin/filters";
import { listConversations } from "@/lib/admin/conversations";
import { listVersions } from "@/lib/personality/service";
import { can } from "@/lib/auth/roles";
import { formatNumber, formatUsd, relativeTime } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { KpiCard } from "@/components/admin/kpi";
import { MessagesChart, Ring } from "@/components/admin/charts";
import { FilterBar } from "@/components/admin/filter-bar";
import { SystemStatus } from "@/components/admin/system-status";
import { Simulator } from "@/components/admin/simulator";
import { DemoLoader } from "@/components/admin/demo-loader";

export const metadata = { title: "Overview" };

const STATUS_TONE = { active: "good", idle: "neutral", closed: "outline" } as const;
const SEV_TONE: Record<string, "warn" | "bad" | "calm"> = { low: "calm", moderate: "warn", high: "bad", critical: "bad" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePage("dashboard.view");
  const { range, source, channels } = parseFilters(await searchParams);
  const period = periodFromDays(range);
  const [m, recent, versions] = await Promise.all([overviewMetrics(period, channels), listConversations({ channels, limit: 7 }), listVersions()]);
  const canSim = can(admin.role, "simulator.use");

  return (
    <>
      <PageHeader
        title="Overview"
        description="A real-time view of Calm-1 on WhatsApp."
        badge={<DataSourceBadge source={source === "production" ? "whatsapp" : source} />}
        actions={<FilterBar range={range} source={source} />}
      />

      {source === "production" && !m.hasData ? (
        <div className="mb-5 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-3">
          No production WhatsApp users yet. Metrics will appear once people message your Calm-1 number. Try the simulator below, or switch to <Link href="?source=demo" className="font-medium text-calm-600">Demo</Link> to preview the dashboard with labelled demo data.
        </div>
      ) : null}

      {source === "demo" ? (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-warn/20 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          <span>{m.hasData ? "You're viewing synthetic demo data for presentation. It is never mixed with production metrics." : "No demo data loaded. Load a synthetic dataset to preview the dashboard – it stays separate and labelled."}</span>
          <DemoLoader hasData={m.hasData} canManage={can(admin.role, "settings.manage")} />
        </div>
      ) : null}

      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Opted-in users" value={formatNumber(m.optedInUsers.value ?? 0)} change={m.optedInUsers.change} icon={UserCheck} hint="Users whose latest privacy consent is a grant (completed onboarding and not stopped)." />
        <KpiCard label="Daily active users" value={formatNumber(m.dailyActiveUsers.value ?? 0)} change={m.dailyActiveUsers.change} icon={Users} hint="Unique users who sent a message in the past 24 hours. Compared with the 24 hours before." />
        <KpiCard label="Messages" value={formatNumber(m.messages.value ?? 0)} change={m.messages.change} icon={MessageCircle} hint={`Messages exchanged (both directions) in the last ${range} days.`} />
        <KpiCard label="Returning users" value={m.returningRate.value === null ? "—" : `${m.returningRate.value.toFixed(0)}%`} change={m.returningRate.change} icon={Repeat} hint="Share of this period's active users who had also messaged before the period." />
        <KpiCard label="AI API cost" value={formatUsd(m.aiCostUsd.value ?? 0)} change={m.aiCostUsd.change} icon={CircleDollarSign} invert footnote="Estimated from token usage" hint="Estimated from recorded token usage and published prices. Reconcile with your Anthropic invoice." />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_300px] gap-4">
        <Card>
          <CardHeader title="Messages over time" description={`Daily volume, last ${range} days · ${SOURCE_LABEL[source]}`} />
          <CardBody>
            <MessagesChart data={m.series} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Returning users" description={`Last ${range} days`} />
          <CardBody className="flex flex-col items-center">
            <Ring value={m.returningRate.value} label="returning" sub={`${m.returningRate.returningUsers} of ${m.returningRate.activeUsers} active users`} />
            <p className="mt-4 text-[11.5px] leading-5 text-ink-4">Of users who messaged in this period, the share who had also messaged before it began.</p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_300px] items-start gap-4">
        <Card>
          <CardHeader
            title="Recent conversations"
            description={source === "production" ? "Message content is hidden. Open a conversation to request audited access." : "Previews shown for non-production data only."}
            action={
              <Link href={`/conversations?source=${source}`} className="text-[13px] font-medium text-calm-600 hover:underline">
                View all
              </Link>
            }
          />
          <CardBody className="px-2 pb-2 pt-3">
            {recent.length ? (
              <ul>
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link href={`/conversations?source=${source}&id=${c.id}`} className="flex items-center gap-4 rounded-xl px-3 py-2.5 hover:bg-surface-muted">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold uppercase text-ink-3">{(c.anonId.split("_")[1] ?? c.anonId).slice(0, 2)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12.5px] text-ink">{c.anonId}</span>
                          {c.maxSeverity !== "none" ? <Badge tone={SEV_TONE[c.maxSeverity] ?? "neutral"}>safety: {c.maxSeverity}</Badge> : null}
                          {c.hadError ? <Badge tone="bad">error</Badge> : null}
                        </div>
                        <div className="truncate text-[12.5px] text-ink-3">{c.preview ?? `${c.messageCount} messages · content hidden`}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                        <div className="mt-1 text-[11.5px] text-ink-4">{relativeTime(c.lastMessageAt)}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={MessageCircle} title="No conversations yet" />
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="System status" description="Live checks" />
            <CardBody className="pt-2">
              <SystemStatus />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="grid grid-cols-2 gap-2 pt-3">
              {[
                { href: "/personality", label: "Edit system prompt", icon: Bot },
                { href: "/content", label: "Manage content", icon: Library },
                { href: "/checkins", label: "Configure check-ins", icon: Bell },
                { href: "/safety", label: "View safety logs", icon: ShieldCheck },
              ].map((a) => (
                <Link key={a.href} href={a.href} className="flex flex-col gap-2 rounded-xl border border-line px-3 py-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-calm-200 hover:bg-calm-50 hover:text-calm-700">
                  <a.icon className="h-4 w-4" strokeWidth={1.75} />
                  {a.label}
                </Link>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      {canSim ? (
        <div className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[17px] font-semibold tracking-display text-ink">Conversation simulator</h2>
              <p className="text-[13px] text-ink-3">The same engine as WhatsApp – real Claude responses, tools, memory and safety. Test identities never mix with production data.</p>
            </div>
            <Link href="/conversations?tab=simulator" className="flex items-center gap-1 text-[13px] font-medium text-calm-600 hover:underline">
              <FileText className="h-3.5 w-3.5" /> Open full simulator
            </Link>
          </div>
          <Simulator versions={versions.map((v) => ({ version: v.version, status: v.status }))} compact />
        </div>
      ) : null}
    </>
  );
}
