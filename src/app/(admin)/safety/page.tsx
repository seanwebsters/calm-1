import { Info, ShieldCheck } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { llm } from "@/lib/llm";
import { parseFilters } from "@/lib/admin/filters";
import { SAFETY_POLICY_VERSION, RULES } from "@/lib/safety/rules";
import { relativeTime } from "@/lib/utils";
import { PageHeader, Stat, Notice } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { HBars, LineSeries } from "@/components/admin/charts";
import { FilterBar } from "@/components/admin/filter-bar";
import { EvalRunner, ReviewQueue, type EventRow } from "./review";

export const metadata = { title: "Safety" };

interface EvalCaseResult {
  id: string;
  expected: string;
  got: string;
  category: string | null;
  passed: boolean;
  outputCheck: string;
}

export default async function SafetyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePage("dashboard.view");
  const sp = await searchParams;
  const { range, source, channels } = parseFilters(sp, { range: 30 });
  const store = db();
  const since = new Date(Date.now() - range * 86400_000);
  const events = await store.find("safety_events", { in: { channel: channels }, gte: { created_at: since.toISOString() }, orderBy: "created_at", desc: true });
  const users = await store.find("users", { in: { channel: channels }, columns: ["id", "anon_id"] });
  const anon = new Map(users.map((u) => [u.id, u.anon_id]));
  const evals = await store.find("ai_evaluations", { where: { kind: "safety" }, orderBy: "created_at", desc: true, limit: 10 });
  const quality = (await store.find("ai_evaluations", { where: { kind: "quality" }, gte: { created_at: since.toISOString() } })).map((q) => q.results as { rating: string; tags: string[]; channel: string });
  const inbound = (await store.find("messages", { where: { direction: "inbound" }, gte: { created_at: since.toISOString() }, columns: ["user_id"] })).filter((m) => anon.has(m.user_id)).length;

  const input = events.filter((e) => e.layer === "input");
  const sevCount = (s: string) => input.filter((e) => e.severity === s).length;
  const byCategory = new Map<string, number>();
  for (const e of input) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
  const reviewed = events.filter((e) => e.review_status !== "unreviewed");
  const fp = reviewed.filter((e) => e.review_status === "false_positive").length;
  const days = Math.min(range, 90);
  const trend = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10);
    return { date: d, events: input.filter((e) => e.created_at.slice(0, 10) === d).length };
  });
  const queue: EventRow[] = events
    .filter((e) => (sp.review === "all" ? true : e.review_status === "unreviewed") && e.severity !== "low")
    .slice(0, 40)
    .map((e) => ({ ...e, anonId: e.user_id ? (anon.get(e.user_id) ?? null) : null }));
  const latest = evals[0];
  const latestCases = ((latest?.results as { cases?: EvalCaseResult[] } | undefined)?.cases ?? []) as EvalCaseResult[];
  const ratings = ["good", "needs_work", "bad"].map((r) => ({ label: r.replace("_", " "), value: quality.filter((q) => q.rating === r).length }));
  const tagCounts = new Map<string, number>();
  for (const q of quality) for (const t of q.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const policies = [...new Set([SAFETY_POLICY_VERSION, ...events.map((e) => e.policy_version), ...evals.map((e) => e.policy_version)])];

  return (
    <>
      <PageHeader title="Safety" description="Layered safety: rules and model review on input, restricted tools, validated output, and data-minimised logging (no message text)." badge={<DataSourceBadge source={source === "production" ? "whatsapp" : source} />} actions={<FilterBar range={range} source={source} ranges={[7, 30, 90]} />} />
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-5">
          <Stat label="Flagged messages" value={input.length.toLocaleString()} sub={inbound ? `${((input.length / inbound) * 1000).toFixed(1)} per 1,000 messages` : "—"} />
        </Card>
        <Card className="p-5">
          <Stat label="Critical" value={<span className={sevCount("critical") ? "text-bad" : ""}>{sevCount("critical")}</span>} sub={`${sevCount("high")} high · ${sevCount("moderate")} moderate`} />
        </Card>
        <Card className="p-5">
          <Stat label="Output interventions" value={events.filter((e) => e.layer === "output").length.toLocaleString()} sub="Resources added or reply replaced" />
        </Card>
        <Card className="p-5">
          <Stat label="Awaiting review" value={events.filter((e) => e.review_status === "unreviewed" && e.severity !== "low").length.toLocaleString()} />
        </Card>
        <Card className="p-5">
          <Stat label="False-positive rate" value={reviewed.length ? `${Math.round((fp / reviewed.length) * 100)}%` : "—"} sub={`${reviewed.length} reviewed`} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_360px] gap-4">
        <Card>
          <CardHeader title="Flagged messages per day" description={`Input-layer events, last ${days} days`} />
          <CardBody>
            <LineSeries data={trend} dataKey="events" name="Flagged" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By category" />
          <CardBody>
            <HBars data={[...byCategory.entries()].map(([label, value]) => ({ label: label.replace(/_/g, " "), value })).sort((a, b) => b.value - a.value)} />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Review queue"
          description="Moderate and above. Mark each as correct or a false positive to tune rules. Transcript access from here is audited."
          action={
            <a href={sp.review === "all" ? "?" : "?review=all"} className="text-[13px] font-medium text-calm-600 hover:underline">
              {sp.review === "all" ? "Show unreviewed" : "Show all"}
            </a>
          }
        />
        <CardBody className="max-h-[480px] overflow-y-auto px-0 pb-1 scroll-thin">
          <ReviewQueue events={queue} canReview={can(admin.role, "safety.review")} />
        </CardBody>
      </Card>

      <div className="mt-4 grid grid-cols-[1fr_360px] gap-4">
        <Card>
          <CardHeader title="Evaluation suite" description={`${latestCases.length || 39} synthetic cases covering escalation and over-flagging. Policy ${SAFETY_POLICY_VERSION}.`} action={<EvalRunner canRun={can(admin.role, "safety.review")} llmConfigured={llm().configured()} />} />
          <CardBody className="px-0 pb-1">
            {latest ? (
              <>
                <div className="flex items-center gap-6 px-5 pb-3">
                  <Stat label="Latest run" value={`${latest.passed}/${latest.total}`} sub={`${latest.mode} · ${relativeTime(latest.created_at)}`} />
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-surface-sunken">
                      <div className="h-2 rounded-full bg-good" style={{ width: `${(latest.passed / Math.max(1, latest.total)) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <div className="max-h-[340px] overflow-y-auto scroll-thin">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Case</TH>
                        <TH>Expected</TH>
                        <TH>Got</TH>
                        <TH>Output check</TH>
                        <TH>Result</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {latestCases.map((c) => (
                        <TR key={c.id}>
                          <TD className="font-mono text-[12px]">{c.id}</TD>
                          <TD className="text-ink-3">{c.expected}</TD>
                          <TD>{c.got}</TD>
                          <TD className="text-ink-3">{c.outputCheck}</TD>
                          <TD>{c.passed ? <Badge tone="good">pass</Badge> : <Badge tone="bad">fail</Badge>}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-ink-4">No evaluation runs yet. Run the suite to get a baseline.</p>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Response quality" description={`${quality.length} human reviews, last ${range} days`} />
            <CardBody className="space-y-4">
              <HBars data={ratings} />
              {tagCounts.size ? <HBars data={[...tagCounts.entries()].map(([label, value]) => ({ label: label.replace(/_/g, " "), value })).sort((a, b) => b.value - a.value).slice(0, 6)} /> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Policy versions" />
            <CardBody className="space-y-2">
              {policies.map((p) => (
                <div key={p} className="flex items-center justify-between text-[13px]">
                  <span className="font-mono text-ink-2">{p}</span>
                  {p === SAFETY_POLICY_VERSION ? <Badge tone="good">current</Badge> : <Badge tone="outline">previous</Badge>}
                </div>
              ))}
              <p className="pt-1 text-[11.5px] text-ink-4">{RULES.length} input rules · output checks for doses, methods, diagnoses and human-impersonation. Changes ship with a new policy version.</p>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Notice icon={Info} tone="neutral">
          <strong className="font-medium">Limitations.</strong> Calm-1 is not a crisis service and does not contact emergency services, alert staff in real time, or monitor users. It points people to appropriate help. Any human escalation process must be designed and approved separately (clinical governance, legal review) before being added.
        </Notice>
        <Notice icon={ShieldCheck}>Safety logs store category, severity and rule only – never message text. Opening a conversation from the queue requires a reason and is recorded.</Notice>
      </div>
    </>
  );
}
