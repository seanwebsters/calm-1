import { Brain } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { llm } from "@/lib/llm";
import { parseFilters } from "@/lib/admin/filters";
import { PageHeader, Stat, Notice } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataSourceBadge } from "@/components/ui/badge";
import { HBars } from "@/components/admin/charts";
import { FilterBar } from "@/components/admin/filter-bar";
import { ExtractionSandbox, RetrievalSandbox } from "./sandbox";

export const metadata = { title: "Memory" };

export default async function MemoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("dashboard.view");
  const { source, channels, range } = parseFilters(await searchParams, { range: 30 });
  const store = db();
  const users = await store.find("users", { in: { channel: channels }, columns: ["id", "onboarding_step"] });
  const ids = new Set(users.map((u) => u.id));
  const prefs = (await store.find("user_preferences", { columns: ["user_id", "memory_enabled"] })).filter((p) => ids.has(p.user_id));
  const mems = (await store.find("memories", { where: { status: "active" }, columns: ["user_id", "kind", "created_at", "last_used_at"] })).filter((m) => ids.has(m.user_id));
  const since = new Date(Date.now() - range * 86400_000).toISOString();
  const events = (await store.find("memory_events", { gte: { created_at: since }, columns: ["user_id", "action", "reason", "actor"] })).filter((e) => ids.has(e.user_id));
  const opted = users.filter((u) => u.onboarding_step === "done").length;
  const enabled = prefs.filter((p) => p.memory_enabled).length;
  const byKind = new Map<string, number>();
  for (const m of mems) byKind.set(m.kind, (byKind.get(m.kind) ?? 0) + 1);
  const count = (a: string, actor?: string) => events.filter((e) => e.action === a && (!actor || e.actor === actor)).length;
  const reasons = new Map<string, number>();
  for (const e of events.filter((e) => e.action === "rejected")) {
    const r = (e.reason ?? "other").replace(/^sensitive: /, "sensitive · ");
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  const usersWithMem = new Set(mems.map((m) => m.user_id)).size;

  return (
    <>
      <PageHeader title="Memory" description="How Calm-1 remembers. Aggregates only – individual memories are visible to the user, and to staff only through audited support access." badge={<DataSourceBadge source={source === "production" ? "whatsapp" : source} />} actions={<FilterBar range={range} source={source} ranges={[7, 30, 90]} />} />
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-5">
          <Stat label="Memory enabled" value={enabled.toLocaleString()} sub={opted ? `${Math.round((enabled / opted) * 100)}% of opted-in users` : "—"} />
        </Card>
        <Card className="p-5">
          <Stat label="Active memories" value={mems.length.toLocaleString()} sub={usersWithMem ? `${(mems.length / usersWithMem).toFixed(1)} per user with memories` : "—"} />
        </Card>
        <Card className="p-5">
          <Stat label={`Saved (${range}d)`} value={count("created").toLocaleString()} sub={`${count("updated")} updated`} />
        </Card>
        <Card className="p-5">
          <Stat label={`Not saved (${range}d)`} value={count("rejected").toLocaleString()} sub="Filtered by sensitivity/confidence" />
        </Card>
        <Card className="p-5">
          <Stat label={`Deleted by users (${range}d)`} value={count("deleted", "user").toLocaleString()} sub={`${count("retrieved")} retrievals`} />
        </Card>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Memories by type" description="Active memories across users" />
          <CardBody>
            <HBars data={[...byKind.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Why candidates weren't saved" description={`Last ${range} days`} />
          <CardBody>
            {reasons.size ? <HBars data={[...reasons.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} /> : <p className="py-8 text-center text-[13px] text-ink-4">No rejected candidates.</p>}
          </CardBody>
        </Card>
      </div>
      <div className="mt-4">
        <Notice icon={Brain}>
          Memory is off by default and only switched on with the user's consent. The extractor never saves health conditions, medication, crises, sexuality, religion, politics, ethnicity, criminal matters, precise locations or identifying details about other people. Event memories expire automatically after their date.
        </Notice>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Extraction sandbox" description="See what Calm-1 would remember from a message. Dry run – nothing is stored." />
          <CardBody>
            <ExtractionSandbox configured={llm().configured()} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Retrieval sandbox" description="Which memories would be added to context for an incoming message?" />
          <CardBody>
            <RetrievalSandbox />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
