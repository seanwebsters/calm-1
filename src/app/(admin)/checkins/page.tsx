import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { parseFilters } from "@/lib/admin/filters";
import { relativeTime } from "@/lib/utils";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { HBars } from "@/components/admin/charts";
import { FilterBar } from "@/components/admin/filter-bar";
import { SchedulingSettings, Templates } from "./templates";

export const metadata = { title: "Check-ins" };

export default async function CheckinsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePage("dashboard.view");
  const { range, source, channels } = parseFilters(await searchParams, { range: 30 });
  const store = db();
  const users = await store.find("users", { in: { channel: channels }, columns: ["id", "anon_id", "onboarding_step"] });
  const ids = new Set(users.map((u) => u.id));
  const anon = new Map(users.map((u) => [u.id, u.anon_id]));
  const since = new Date(Date.now() - range * 86400_000).toISOString();
  const prefs = (await store.find("checkin_preferences", {})).filter((p) => ids.has(p.user_id));
  const deliveries = (await store.find("checkin_deliveries", { gte: { created_at: since }, orderBy: "created_at", desc: true })).filter((d) => ids.has(d.user_id));
  const usage = (await store.find("usage_events", { gte: { created_at: since }, in: { kind: ["checkin_opt_in", "checkin_opt_out"], channel: channels } })) as { kind: string }[];
  const templates = await store.find("message_templates", { orderBy: "name" });
  const settings = await getSettings();

  const enabled = prefs.filter((p) => p.enabled);
  const optedIn = users.filter((u) => u.onboarding_step === "done").length;
  const subscribers = new Set(enabled.map((p) => p.user_id)).size;
  const sent = deliveries.filter((d) => ["sent", "delivered", "read"].includes(d.status));
  const failed = deliveries.filter((d) => d.status === "failed");
  const replied = deliveries.filter((d) => d.replied_at);
  const ins = usage.filter((u) => u.kind === "checkin_opt_in").length;
  const outs = usage.filter((u) => u.kind === "checkin_opt_out").length;
  const byStatus = ["sent", "delivered", "read", "failed", "skipped"].map((s) => ({ label: s, value: deliveries.filter((d) => d.status === s).length }));
  const byKind = (["morning", "evening", "bedtime"] as const).map((k) => ({ label: k, value: enabled.filter((p) => p.kind === k).length }));
  const byFreq = (["daily", "weekdays", "weekly"] as const).map((k) => ({ label: k, value: enabled.filter((p) => p.frequency === k).length }));
  const pausedCount = enabled.filter((p) => p.paused).length;
  const canEdit = can(admin.role, "checkins.manage");

  return (
    <>
      <PageHeader title="Check-ins" description="Opt-in WhatsApp check-ins. No unsolicited messages: users subscribe in conversation and can pause or stop with one word." badge={<DataSourceBadge source={source === "production" ? "whatsapp" : source} />} actions={<FilterBar range={range} source={source} ranges={[7, 30, 90]} />} />
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-5">
          <Stat label="Subscribers" value={subscribers.toLocaleString()} sub={optedIn ? `${Math.round((subscribers / optedIn) * 100)}% of opted-in users` : "—"} />
        </Card>
        <Card className="p-5">
          <Stat label={`Delivered (${range}d)`} value={sent.length.toLocaleString()} sub={`${pausedCount} paused subscriptions`} />
        </Card>
        <Card className="p-5">
          <Stat label="Reply rate" value={sent.length ? `${Math.round((replied.length / sent.length) * 100)}%` : "—"} sub="Replied within 12 hours" />
        </Card>
        <Card className="p-5">
          <Stat label="Opt-out rate" value={ins ? `${Math.round((outs / ins) * 100)}%` : "—"} sub={`${outs} opt-outs · ${ins} opt-ins`} />
        </Card>
        <Card className="p-5">
          <Stat label="Failed sends" value={<span className={failed.length ? "text-bad" : ""}>{failed.length.toLocaleString()}</span>} sub={`Last ${range} days`} />
        </Card>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Deliveries by status" />
          <CardBody>
            <HBars data={byStatus} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Preferences" description="Active subscriptions" />
          <CardBody className="space-y-5">
            <HBars data={byKind} />
            <HBars data={byFreq} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Scheduling" description="Applies to every user" />
          <CardBody>
            <SchedulingSettings initial={settings.checkins} canEdit={canEdit} />
          </CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <Templates templates={templates} canEdit={canEdit} metaConfigured={!!(env.whatsappAccessToken && env.whatsappBusinessAccountId)} />
      </Card>
      <Card className="mt-4">
        <CardHeader title="Recent failures" description="Undelivered or blocked check-ins, with the reason." />
        <CardBody className="px-0 pb-1">
          {failed.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>User</TH>
                  <TH>Mode</TH>
                  <TH>Scheduled</TH>
                  <TH>Reason</TH>
                </TR>
              </THead>
              <TBody>
                {failed.slice(0, 15).map((d) => (
                  <TR key={d.id}>
                    <TD className="font-mono text-[12.5px]">{anon.get(d.user_id)}</TD>
                    <TD>
                      <Badge tone="outline">{d.mode}</Badge>
                    </TD>
                    <TD className="text-ink-3">{relativeTime(d.scheduled_for)}</TD>
                    <TD className="text-bad">{d.error}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 pb-4 text-[13px] text-ink-4">No failed check-ins in this period.</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}
