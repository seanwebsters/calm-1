import Link from "next/link";
import { Users as UsersIcon } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { parseFilters } from "@/lib/admin/filters";
import { listUsers } from "@/lib/admin/users";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/utils";
import { PageHeader, EmptyState, Stat } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/admin/filter-bar";
import { SearchBox } from "@/components/admin/search-box";
import { UserDrawer } from "./user-drawer";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePage("dashboard.view");
  const sp = await searchParams;
  const { source, channels } = parseFilters(sp);
  const analystOnly = admin.role === "analyst";
  const users = analystOnly ? [] : await listUsers(channels, sp.q);
  const selected = users.find((u) => u.id === sp.id);
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(users.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page ?? 1) || 1));
  const pageUsers = users.slice((page - 1) * PAGE, page * PAGE);
  const pageHref = (n: number) => `/users?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([k, v]) => v !== undefined && k !== "id")) as Record<string, string>), page: String(n) }).toString()}`;
  const deletions = await db().find("deletion_requests", { orderBy: "requested_at", desc: true, limit: 8 });
  const optedIn = users.filter((u) => u.optedIn).length;

  return (
    <>
      <PageHeader title="Users" description="Operational metadata only. Phone numbers are masked; conversations and memories need separate, audited access." badge={<DataSourceBadge source={source === "production" ? "whatsapp" : source} />} actions={<FilterBar range={14} source={source} showRange={false} />} />
      {analystOnly ? (
        <Card>
          <EmptyState icon={UsersIcon} title="Analysts see aggregated data only">
            User-level records aren't available to your role. See Analytics for aggregates.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-4 gap-4">
            <Card className="p-5">
              <Stat label="Users" value={users.length.toLocaleString()} />
            </Card>
            <Card className="p-5">
              <Stat label="Opted in" value={optedIn.toLocaleString()} />
            </Card>
            <Card className="p-5">
              <Stat label="Memory on" value={users.filter((u) => u.memory).length.toLocaleString()} sub={optedIn ? `${Math.round((users.filter((u) => u.memory).length / optedIn) * 100)}% of opted-in` : undefined} />
            </Card>
            <Card className="p-5">
              <Stat label="With check-ins" value={users.filter((u) => u.checkins.length).length.toLocaleString()} />
            </Card>
          </div>
          <Card>
            <CardHeader title="All users" description={`${users.length.toLocaleString()} users · page ${page} of ${pages}`} action={<SearchBox placeholder="Anon ID or last 4 digits" />} />
            <CardBody className="px-0 pb-1">
              {users.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>User</TH>
                      <TH>Registered</TH>
                      <TH>Last active</TH>
                      <TH className="text-right">Messages</TH>
                      <TH>Opt-in</TH>
                      <TH>Memory</TH>
                      <TH>Check-ins</TH>
                      <TH>Lang</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pageUsers.map((u) => (
                      <TR key={u.id} className="hover:bg-surface-muted">
                        <TD>
                          <Link href={`/users?source=${source}&id=${u.id}`} className="block">
                            <div className="font-mono text-[12.5px] font-medium text-ink">{u.anonId}</div>
                            <div className="text-[11.5px] text-ink-4">{u.phone}</div>
                          </Link>
                        </TD>
                        <TD className="text-ink-3">{new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</TD>
                        <TD className="text-ink-3">{relativeTime(u.lastActive)}</TD>
                        <TD className="tabular text-right">{u.messages.toLocaleString()}</TD>
                        <TD>{u.optedIn ? <Badge tone="good">Opted in</Badge> : <Badge tone="outline">No</Badge>}</TD>
                        <TD>{u.memory ? <Badge tone="calm">On</Badge> : <span className="text-ink-4">Off</span>}</TD>
                        <TD className="text-[12px] text-ink-3">{u.checkins.length ? u.checkins.join(", ") : <span className="text-ink-4">—</span>}</TD>
                        <TD className="uppercase text-ink-3">{u.language}</TD>
                        <TD>
                          <Badge tone={u.status === "active" ? "good" : u.status === "opted_out" ? "warn" : "neutral"}>{u.status.replace("_", " ")}</Badge>
                          {u.failedLast7d ? <Badge tone="bad" className="ml-1">{u.failedLast7d} failed</Badge> : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState icon={UsersIcon} title="No users yet" />
              )}
              {pages > 1 ? (
                <div className="flex items-center justify-between border-t border-line px-5 pt-3 text-[13px]">
                  <span className="text-ink-4">
                    Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, users.length)} of {users.length}
                  </span>
                  <div className="flex gap-2 pb-2">
                    {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg border border-line px-3 py-1 text-ink-2 hover:bg-surface-muted">Previous</Link> : null}
                    {page < pages ? <Link href={pageHref(page + 1)} className="rounded-lg border border-line px-3 py-1 text-ink-2 hover:bg-surface-muted">Next</Link> : null}
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Card className="mt-4">
            <CardHeader title="Deletion requests" description="Erasures completed via WhatsApp, the simulator or support. Only the anonymous ID is kept as proof of erasure." />
            <CardBody className="px-0 pb-1">
              {deletions.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Anonymous ID</TH>
                      <TH>Requested via</TH>
                      <TH>Requested</TH>
                      <TH>Status</TH>
                      <TH>Handled by</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {deletions.map((d) => (
                      <TR key={d.id}>
                        <TD className="font-mono text-[12.5px]">{d.anon_id}</TD>
                        <TD className="capitalize">{d.requested_via}</TD>
                        <TD>{relativeTime(d.requested_at)}</TD>
                        <TD>
                          <Badge tone={d.status === "completed" ? "good" : "warn"}>{d.status}</Badge>
                        </TD>
                        <TD className="text-ink-3">{d.handled_by ?? "User (self-service)"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="px-5 pb-4 text-[13px] text-ink-4">No deletion requests yet.</p>
              )}
            </CardBody>
          </Card>
          {selected ? <UserDrawer user={selected} perms={{ manage: can(admin.role, "users.manage"), delete: can(admin.role, "users.delete"), memories: can(admin.role, "memories.view_user") }} /> : null}
        </>
      )}
    </>
  );
}
