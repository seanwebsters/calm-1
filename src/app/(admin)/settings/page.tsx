import Link from "next/link";
import { CheckCircle2, CircleDashed, KeyRound } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings, MODEL_OPTIONS } from "@/lib/settings";
import { systemHealth } from "@/lib/health";
import { spendTodayUsd } from "@/lib/llm";
import { transcriptionConfigured } from "@/lib/voice/transcribe";
import { cn, formatUsd, relativeTime } from "@/lib/utils";
import { PageHeader, Notice } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AiForm, PrivacyForm, RetryJob, TeamTable, VoiceForm } from "./forms";

export const metadata = { title: "Settings" };

const TABS = [
  { id: "ai", label: "AI configuration" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "privacy", label: "Privacy" },
  { id: "team", label: "Team" },
  { id: "system", label: "System" },
];

function Secret({ label, set }: { label: string; set: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <span className="flex items-center gap-2 font-mono text-[12.5px] text-ink-2">
        <KeyRound className="h-3.5 w-3.5 text-ink-4" />
        {label}
      </span>
      {set ? (
        <span className="flex items-center gap-1.5 text-good">
          <CheckCircle2 className="h-3.5 w-3.5" /> Set
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-ink-4">
          <CircleDashed className="h-3.5 w-3.5" /> Not set
        </span>
      )}
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePage("dashboard.view");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "ai";
  const settings = await getSettings();
  const canEdit = can(admin.role, "settings.manage");
  const store = db();

  let body: React.ReactNode = null;
  if (tab === "ai") {
    const spend = await spendTodayUsd();
    body = (
      <div className="grid grid-cols-[1fr_320px] items-start gap-4">
        <Card>
          <CardHeader title="Model & generation" description="Changes apply to the next message – no redeploy." />
          <CardBody className="pt-1">
            <AiForm initial={settings.ai} canEdit={canEdit} models={MODEL_OPTIONS} />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Credentials" description="Values are never shown in the dashboard." />
            <CardBody className="pt-2">
              <Secret label="ANTHROPIC_API_KEY" set={!!env.anthropicApiKey} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Spend today" description="Estimated, UTC day" />
            <CardBody>
              <div className="tabular text-[26px] font-semibold tracking-display text-ink">{formatUsd(spend)}</div>
              <div className="mt-2 h-2 rounded-full bg-surface-sunken">
                <div className={cn("h-2 rounded-full", spend / Math.max(1, settings.ai.dailyCostLimitUsd) > 0.8 ? "bg-warn" : "bg-series-1")} style={{ width: `${Math.min(100, (spend / Math.max(0.01, settings.ai.dailyCostLimitUsd)) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-[12px] text-ink-4">{settings.ai.dailyCostLimitUsd ? `of ${formatUsd(settings.ai.dailyCostLimitUsd)} cap` : "No cap set"}</p>
            </CardBody>
          </Card>
          <Notice tone="neutral">Data sent to Anthropic is used only to generate responses. Under Anthropic's commercial terms, API inputs and outputs aren't used for model training; confirm your organisation's retention settings (and zero-data-retention eligibility) in the Anthropic Console and record them in your DPIA.</Notice>
        </div>
      </div>
    );
  } else if (tab === "whatsapp") {
    const health = (await systemHealth()).find((s) => s.key === "whatsapp")!;
    const templates = await store.find("message_templates", {});
    const day = new Date(Date.now() - 86400_000).toISOString();
    const out = await store.find("messages", { where: { direction: "outbound" }, gte: { created_at: day }, columns: ["status", "user_id"] });
    const waUsers = new Set((await store.find("users", { where: { channel: "whatsapp" }, columns: ["id"] })).map((u) => u.id));
    const wa = out.filter((m) => waUsers.has(m.user_id));
    const webhookUrl = `${env.appUrl.replace(/\/$/, "")}/api/whatsapp/webhook`;
    const lastWebhook = await store.find("webhook_events", { orderBy: "created_at", desc: true, limit: 1 });
    body = (
      <div className="grid grid-cols-2 items-start gap-4">
        <Card>
          <CardHeader title="Connection" description={health.detail} action={<Badge tone={health.state === "operational" ? "good" : health.state === "not_configured" ? "outline" : "bad"}>{health.state.replace("_", " ")}</Badge>} />
          <CardBody className="space-y-1 pt-3 text-[13px]">
            <div className="flex justify-between py-1.5">
              <span className="text-ink-3">Phone number ID</span>
              <span className="font-mono text-ink">{env.whatsappPhoneNumberId || "—"}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-ink-3">Business account ID</span>
              <span className="font-mono text-ink">{env.whatsappBusinessAccountId || "—"}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-ink-3">Graph API version</span>
              <span className="font-mono text-ink">{env.whatsappGraphVersion}</span>
            </div>
            <div className="border-t border-line pt-2">
              <Secret label="WHATSAPP_ACCESS_TOKEN" set={!!env.whatsappAccessToken} />
              <Secret label="WHATSAPP_APP_SECRET" set={!!env.whatsappAppSecret} />
              <Secret label="WHATSAPP_VERIFY_TOKEN" set={!!env.whatsappVerifyToken} />
              <Secret label="ELEVENLABS_API_KEY (voice notes)" set={transcriptionConfigured()} />
            </div>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Webhook" description="Configure in Meta App Dashboard → WhatsApp → Configuration." />
            <CardBody className="space-y-2 text-[13px]">
              <div className="rounded-lg bg-surface-sunken px-3 py-2 font-mono text-[12px] text-ink-2">{webhookUrl}</div>
              <p className="text-ink-3">Subscribe to the <code className="font-mono text-[12px]">messages</code> field. Requests are rejected unless signed with your app secret.</p>
              <p className="text-ink-3">Last event received: {lastWebhook[0] ? relativeTime(lastWebhook[0].created_at) : "never"}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Delivery health" description="Production replies, last 24 hours" />
            <CardBody className="grid grid-cols-4 gap-3 text-center">
              {(["sent", "delivered", "read", "failed"] as const).map((s) => (
                <div key={s}>
                  <div className={cn("tabular text-[20px] font-semibold", s === "failed" && wa.some((m) => m.status === "failed") ? "text-bad" : "text-ink")}>{wa.filter((m) => m.status === s).length}</div>
                  <div className="text-[12px] capitalize text-ink-4">{s}</div>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Templates" action={<Link href="/checkins" className="text-[13px] font-medium text-calm-600 hover:underline">Manage</Link>} />
            <CardBody className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <Badge key={t.id} tone={t.meta_status === "approved" ? "good" : t.meta_status === "rejected" ? "bad" : "outline"}>
                  {t.name}: {t.meta_status}
                </Badge>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Voice notes" />
            <CardBody className="pt-1">
              <VoiceForm initial={settings.voice} canEdit={canEdit} />
            </CardBody>
          </Card>
        </div>
      </div>
    );
  } else if (tab === "privacy") {
    const deletions = await store.count("deletion_requests", { gte: { requested_at: new Date(Date.now() - 30 * 86400_000).toISOString() } });
    body = (
      <div className="grid grid-cols-[1fr_340px] items-start gap-4">
        <Card>
          <CardHeader title="Retention & consent" />
          <CardBody className="pt-1">
            <PrivacyForm initial={settings.privacy} canEdit={canEdit} />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Deletion workflow" />
            <CardBody className="space-y-2 text-[13px] text-ink-2">
              <p>Users send DELETE MY DATA then CONFIRM DELETE. Erasure is immediate: messages, memories, journal, consents and check-ins are removed; telemetry is de-linked. Staff can erase on request from Users.</p>
              <p className="text-ink-4">{deletions} erasures in the last 30 days.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="How data is protected" />
            <CardBody>
              <ul className="space-y-1.5 text-[12.5px] text-ink-2">
                <li>• Message text, memories, journal and phone numbers are AES-256-GCM encrypted in the app before storage.</li>
                <li>• Phone lookup uses a keyed hash; staff see masked numbers.</li>
                <li>• Row Level Security on every table; the browser never queries data directly.</li>
                <li>• Transcript, memory and export access is permissioned and audited.</li>
                <li>• Safety logs and analytics hold no message text.</li>
              </ul>
            </CardBody>
          </Card>
          <Notice tone="warn">This design supports UK GDPR obligations, but compliance isn't complete without a formal review: DPIA, lawful-basis assessment (including special-category data), processor agreements and the published privacy notice.</Notice>
        </div>
      </div>
    );
  } else if (tab === "team") {
    const admins = await store.find("admin_users", { orderBy: "created_at" });
    const logs = can(admin.role, "audit.view") ? await store.find("admin_audit_logs", { orderBy: "created_at", desc: true, limit: 40 }) : [];
    body = (
      <div className="grid grid-cols-[1fr_360px] items-start gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Team members" description={env.authProvider === "supabase" ? "Supabase Auth" : "Local passcode mode – switch AUTH_PROVIDER=supabase for named accounts"} />
            <CardBody>
              <TeamTable admins={admins} canManage={can(admin.role, "team.manage")} selfId={admin.adminId} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Access log" description="Sign-ins, transcript access, exports, deletions and configuration changes." />
            <CardBody className="px-0 pb-1">
              {logs.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>When</TH>
                      <TH>Who</TH>
                      <TH>Action</TH>
                      <TH>Target</TH>
                      <TH>Reason</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {logs.map((l) => (
                      <TR key={l.id}>
                        <TD className="whitespace-nowrap text-ink-3">{relativeTime(l.created_at)}</TD>
                        <TD className="text-ink-2">{l.admin_email ?? "system"}</TD>
                        <TD className="font-mono text-[12px]">{l.action}</TD>
                        <TD className="font-mono text-[11.5px] text-ink-3">{l.target_type ? `${l.target_type}:${(l.target_id ?? "").slice(0, 14)}` : "—"}</TD>
                        <TD className="max-w-[220px] truncate text-ink-3">{l.reason ?? ""}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="px-5 pb-4 text-[13px] text-ink-4">{can(admin.role, "audit.view") ? "No entries yet." : "Your role can't view the access log."}</p>
              )}
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Roles" />
          <CardBody className="space-y-3">
            {Object.entries(ROLE_LABELS).map(([k, label]) => (
              <div key={k}>
                <div className="text-[13px] font-medium text-ink">{label}</div>
                <div className="text-[12.5px] text-ink-3">{ROLE_DESCRIPTIONS[k as keyof typeof ROLE_DESCRIPTIONS]}</div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    );
  } else {
    const services = await systemHealth();
    const dead = await store.find("jobs", { in: { status: ["dead", "failed"] }, orderBy: "updated_at", desc: true, limit: 20 });
    const queued = await store.count("jobs", { where: { status: "queued" } });
    const running = await store.count("jobs", { where: { status: "running" } });
    const hb = await store.get("settings", "worker_heartbeat");
    const costs = await store.find("api_costs", { gte: { created_at: new Date(Date.now() - 86400_000).toISOString() } });
    const byPurpose = new Map<string, { calls: number; cost: number; tokens: number }>();
    for (const c of costs) {
      const e = byPurpose.get(c.purpose) ?? { calls: 0, cost: 0, tokens: 0 };
      e.calls++;
      e.cost += Number(c.cost_usd);
      e.tokens += c.input_tokens + c.output_tokens + c.cache_read_tokens;
      byPurpose.set(c.purpose, e);
    }
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-5 gap-3">
          {services.map((s) => (
            <Card key={s.key} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-ink">{s.label}</span>
                <span className={cn("h-2 w-2 rounded-full", s.state === "operational" ? "bg-good" : s.state === "degraded" ? "bg-warn" : s.state === "down" ? "bg-bad" : "bg-ink-4")} />
              </div>
              <div className="mt-1 text-[12px] capitalize text-ink-3">{s.state.replace("_", " ")}</div>
              <div className="mt-1 line-clamp-2 text-[11.5px] text-ink-4">{s.detail}</div>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Background workers" />
            <CardBody className="grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <div className="text-ink-4">Queued</div>
                <div className="tabular text-[20px] font-semibold text-ink">{queued}</div>
              </div>
              <div>
                <div className="text-ink-4">Running</div>
                <div className="tabular text-[20px] font-semibold text-ink">{running}</div>
              </div>
              <div>
                <div className="text-ink-4">Last heartbeat</div>
                <div className="text-[13px] font-medium text-ink">{hb ? relativeTime(String((hb.data as { at?: string }).at)) : "never"}</div>
                <div className="truncate text-[11.5px] text-ink-4">{hb ? String((hb.data as { workerId?: string }).workerId) : ""}</div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Deployment" />
            <CardBody className="grid grid-cols-2 gap-y-2 text-[13px]">
              <span className="text-ink-4">Environment</span>
              <span className="text-right text-ink">{env.deployment.environment}</span>
              <span className="text-ink-4">Commit</span>
              <span className="text-right font-mono text-ink">{env.deployment.commit.slice(0, 10)}</span>
              <span className="text-ink-4">Region</span>
              <span className="text-right text-ink">{env.deployment.region}</span>
              <span className="text-ink-4">Data backend</span>
              <span className="text-right text-ink">{db().kind}</span>
              <span className="text-ink-4">Auth</span>
              <span className="text-right text-ink">{env.authProvider}</span>
              <span className="text-ink-4">Rate limiting</span>
              <span className="text-right text-ink">{env.upstashUrl ? "Upstash Redis" : "In-process"}</span>
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="API usage" description="Claude calls in the last 24 hours, by purpose (estimated cost)" />
          <CardBody className="px-0 pb-1">
            <Table>
              <THead>
                <TR>
                  <TH>Purpose</TH>
                  <TH className="text-right">Calls</TH>
                  <TH className="text-right">Tokens</TH>
                  <TH className="text-right">Est. cost</TH>
                </TR>
              </THead>
              <TBody>
                {[...byPurpose.entries()].map(([p, v]) => (
                  <TR key={p}>
                    <TD className="capitalize">{p}</TD>
                    <TD className="tabular text-right">{v.calls}</TD>
                    <TD className="tabular text-right">{v.tokens.toLocaleString()}</TD>
                    <TD className="tabular text-right">{formatUsd(v.cost)}</TD>
                  </TR>
                ))}
                {!byPurpose.size ? (
                  <TR>
                    <TD colSpan={4} className="text-ink-4">
                      No calls in the last 24 hours.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Failed jobs" description="Jobs that exhausted their retries" />
          <CardBody className="px-0 pb-1">
            {dead.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Type</TH>
                    <TH>Attempts</TH>
                    <TH>Last error</TH>
                    <TH>Updated</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {dead.map((j) => (
                    <TR key={j.id}>
                      <TD className="font-mono text-[12px]">{j.type}</TD>
                      <TD>{j.attempts}</TD>
                      <TD className="max-w-[420px] truncate text-bad">{j.last_error}</TD>
                      <TD className="text-ink-3">{relativeTime(j.updated_at)}</TD>
                      <TD className="text-right">{canEdit ? <RetryJob id={j.id} /> : null}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="px-5 pb-4 text-[13px] text-ink-4">No failed jobs.</p>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Configure Calm-1 without redeploying. Secrets are managed as environment variables and never displayed here." />
      <div className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link key={t.id} href={`/settings?tab=${t.id}`} className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[13.5px] font-medium", tab === t.id ? "border-calm-500 text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </div>
      {!canEdit && tab !== "team" ? <div className="mb-4"><Notice tone="neutral">View only – your role can't change settings.</Notice></div> : null}
      {body}
    </>
  );
}
