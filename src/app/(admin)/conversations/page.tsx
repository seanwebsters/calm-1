import Link from "next/link";
import { AlertTriangle, MessagesSquare } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { parseFilters } from "@/lib/admin/filters";
import { conversationMeta, listConversations } from "@/lib/admin/conversations";
import { listVersions } from "@/lib/personality/service";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { cn, formatUsd, relativeTime } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { Simulator } from "@/components/admin/simulator";
import { ListFilters, ReviewForm, TranscriptGate } from "./panels";

export const metadata = { title: "Conversations" };

const SEV: Record<string, "calm" | "warn" | "bad"> = { low: "calm", moderate: "warn", high: "bad", critical: "bad" };

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePage("dashboard.view");
  const sp = await searchParams;
  const { source, channels } = parseFilters(sp);
  const tab = sp.tab === "simulator" ? "simulator" : "list";
  const canSim = can(admin.role, "simulator.use");

  const tabs = (
    <div className="mb-5 flex gap-1 border-b border-line">
      {[
        { id: "list", label: "Conversations", href: `/conversations?source=${source}` },
        ...(canSim ? [{ id: "simulator", label: "Run test conversations", href: "/conversations?tab=simulator" }] : []),
      ].map((t) => (
        <Link key={t.id} href={t.href} className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[13.5px] font-medium", tab === t.id ? "border-calm-500 text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (tab === "simulator" && canSim) {
    const versions = await listVersions();
    return (
      <>
        <PageHeader title="Conversations" description="Run test conversations through the production engine. Simulator data is kept separate and clearly labelled." badge={<DataSourceBadge source="simulator" />} />
        {tabs}
        <Simulator versions={versions.map((v) => ({ version: v.version, status: v.status }))} />
      </>
    );
  }

  const since = sp.days && sp.days !== "all" ? new Date(Date.now() - Number(sp.days) * 86400_000).toISOString() : undefined;
  const list = await listConversations({ channels, q: sp.q, status: sp.status, severity: sp.severity, model: sp.model, since, errors: sp.errors === "1", limit: 60 });
  const selectedId = sp.id ?? list[0]?.id;
  const meta = selectedId ? await conversationMeta(selectedId) : null;
  const settings = await getSettings();
  const models = [...new Set((await db().find("conversations", { notNull: ["model"], columns: ["model"], limit: 500 })).map((c) => c.model!))];
  const production = meta?.conversation.channel === "whatsapp";

  return (
    <>
      <PageHeader title="Conversations" description="Operate and evaluate conversations. Production content stays private unless access is authorised and audited." badge={<DataSourceBadge source={source === "production" ? "whatsapp" : source} />} actions={<FilterBar range={14} source={source} showRange={false} />} />
      {tabs}
      <div className="grid h-[calc(100vh-250px)] min-h-[620px] grid-cols-[300px_1fr_320px] overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {/* List */}
        <div className="flex min-h-0 flex-col border-r border-line">
          <ListFilters models={models} />
          <div className="flex-1 overflow-y-auto scroll-thin">
            {list.length ? (
              list.map((c) => {
                const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
                p.set("id", c.id);
                return (
                  <Link key={c.id} href={`/conversations?${p.toString()}`} className={cn("block border-b border-line px-4 py-3 transition-colors", c.id === selectedId ? "bg-calm-50" : "hover:bg-surface-muted")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12.5px] text-ink">{c.anonId}</span>
                      <span className="text-[11px] text-ink-4">{relativeTime(c.lastMessageAt)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{c.preview ?? `${c.messageCount} messages`}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone={c.status === "active" ? "good" : "outline"}>{c.status}</Badge>
                      {c.maxSeverity !== "none" ? <Badge tone={SEV[c.maxSeverity] ?? "neutral"}>{c.maxSeverity}</Badge> : null}
                      {c.hadError ? <Badge tone="bad">failure</Badge> : null}
                    </div>
                  </Link>
                );
              })
            ) : (
              <EmptyState icon={MessagesSquare} title="No conversations match" />
            )}
          </div>
        </div>

        {/* Selected */}
        <div className="flex min-h-0 flex-col">
          {meta ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <div>
                  <div className="font-mono text-[13.5px] font-medium text-ink">{meta.anonId}</div>
                  <div className="text-[12px] text-ink-4">
                    Started {new Date(meta.conversation.started_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {meta.conversation.message_count} messages
                  </div>
                </div>
                <DataSourceBadge source={meta.conversation.channel} />
                {production ? <Badge tone="outline">Production</Badge> : null}
              </div>
              <div className="flex-1 overflow-y-auto bg-surface-muted px-5 py-4 scroll-thin">
                <TranscriptGate key={meta.conversation.id} id={meta.conversation.id} production={production} canView={can(admin.role, "transcripts.view")} accessEnabled={settings.privacy.allowTranscriptAccess} />
              </div>
            </>
          ) : (
            <EmptyState icon={MessagesSquare} title="Select a conversation" className="m-auto" />
          )}
        </div>

        {/* Metadata */}
        <div className="min-h-0 overflow-y-auto border-l border-line scroll-thin">
          {meta ? (
            <div className="divide-y divide-line">
              <div className="px-4 py-4">
                <div className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Summary</div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12.5px]">
                  <Meta k="Model" v={meta.conversation.model ?? "—"} />
                  <Meta k="Prompt" v={meta.conversation.prompt_version ? `v${meta.conversation.prompt_version}` : "—"} />
                  <Meta k="Avg latency" v={meta.totals.avgLatency ? `${(meta.totals.avgLatency / 1000).toFixed(2)}s` : "—"} />
                  <Meta k="Est. cost" v={formatUsd(meta.totals.cost)} />
                  <Meta k="Tokens in" v={meta.totals.inputTokens.toLocaleString()} />
                  <Meta k="Tokens out" v={meta.totals.outputTokens.toLocaleString()} />
                  <Meta k="Max safety" v={meta.conversation.max_severity} />
                  <Meta k="Failures" v={String(meta.totals.failures)} />
                </dl>
              </div>
              <div className="px-4 py-4">
                <div className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Replies</div>
                <div className="space-y-1">
                  {meta.messages.filter((m) => m.direction === "outbound").length ? (
                    meta.messages
                      .filter((m) => m.direction === "outbound")
                      .map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-[12px]">
                          <span className="text-ink-3">
                            #{m.seq} · {m.kind === "system" ? "service" : (m.model ?? "—")}
                          </span>
                          <span className="tabular flex items-center gap-2 text-ink-2">
                            {m.latency_ms ? `${(m.latency_ms / 1000).toFixed(1)}s` : ""}
                            {m.output_tokens ? <span className="text-ink-4">{m.output_tokens} tok</span> : null}
                            {m.status === "failed" || m.error ? <AlertTriangle className="h-3.5 w-3.5 text-bad" /> : null}
                          </span>
                        </div>
                      ))
                  ) : (
                    <p className="text-[12px] text-ink-4">No replies.</p>
                  )}
                </div>
                {meta.messages.filter((m) => m.error).map((m) => (
                  <div key={m.id} className="mt-2 rounded-lg bg-bad-soft px-2.5 py-1.5 text-[11.5px] text-bad">
                    #{m.seq}: {m.error}
                  </div>
                ))}
              </div>
              <div className="px-4 py-4">
                <div className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Tool invocations</div>
                {meta.tools.length ? (
                  <div className="space-y-1.5">
                    {meta.tools.map((t) => (
                      <div key={t.id} className="rounded-lg border border-line px-2.5 py-1.5 text-[12px]">
                        <div className="flex justify-between">
                          <span className="font-medium text-ink">{t.tool}</span>
                          <Badge tone={t.status === "ok" ? "good" : t.status === "denied" ? "warn" : "bad"}>{t.status}</Badge>
                        </div>
                        <div className="font-mono text-[11px] text-ink-3">{JSON.stringify(t.input)}</div>
                        <div className="text-[11px] text-ink-4">{t.output_summary} · {t.latency_ms}ms</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-4">None.</p>
                )}
              </div>
              <div className="px-4 py-4">
                <div className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Safety events</div>
                {meta.safety.length ? (
                  <div className="space-y-1">
                    {meta.safety.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-[12px]">
                        <span className="text-ink-2">
                          {s.layer} · {s.category.replace(/_/g, " ")}
                        </span>
                        <Badge tone={SEV[s.severity] ?? "neutral"}>{s.severity}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-4">None.</p>
                )}
              </div>
              {can(admin.role, "simulator.use") ? (
                <div className="px-4 py-4">
                  <div className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Quality review</div>
                  <ReviewForm id={meta.conversation.id} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-ink-4">{k}</dt>
      <dd className="tabular truncate font-medium text-ink">{v}</dd>
    </div>
  );
}
