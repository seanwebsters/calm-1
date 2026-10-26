"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Download, Trash2, X } from "lucide-react";
import { api, toast } from "@/lib/client";
import type { UserListItem } from "@/lib/admin/users";
import { relativeTime } from "@/lib/utils";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

export function UserDrawer({ user, perms }: { user: UserListItem; perms: { manage: boolean; delete: boolean; memories: boolean } }) {
  const router = useRouter();
  const [action, setAction] = useState<null | { kind: "delete" | "export" | "memories" | "pause_checkins" | "stop_checkins" | "memory_off" | "opt_out"; title: string; danger?: boolean }>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [mems, setMems] = useState<{ id: string; kind: string; text: string; event_date: string | null }[] | null>(null);

  const close = () => router.push("/users" + window.location.search.replace(/([?&])id=[^&]*/, "$1").replace(/[?&]$/, ""));

  async function run() {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === "export") {
        window.location.href = `/api/users/${user.id}/export?reason=${encodeURIComponent(reason)}`;
      } else if (action.kind === "delete") {
        await api(`/api/users/${user.id}/delete`, { body: { reason } });
        toast("User data erased", "good");
        close();
      } else if (action.kind === "memories") {
        const r = await api<{ memories: typeof mems }>(`/api/users/${user.id}/memories`, { body: { reason } });
        setMems(r.memories);
      } else {
        await api(`/api/users/${user.id}/support`, { body: { action: action.kind, reason } });
        toast("Done", "good");
        router.refresh();
      }
      setAction(null);
      setReason("");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <motion.aside initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.18 }} className="fixed bottom-0 right-0 top-0 z-40 w-[420px] overflow-y-auto border-l border-line bg-surface shadow-pop scroll-thin">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <div className="font-mono text-[15px] font-medium text-ink">{user.anonId}</div>
            <div className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-3">
              {user.phone} <DataSourceBadge source={user.channel} />
            </div>
          </div>
          <button onClick={close} className="rounded-lg p-1 text-ink-4 hover:bg-surface-sunken hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 px-5 py-5">
          <section>
            <h3 className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Account</h3>
            <dl className="grid grid-cols-2 gap-y-2.5 text-[12.5px]">
              <Item k="Status" v={<Badge tone={user.status === "active" ? "good" : user.status === "opted_out" ? "warn" : "neutral"}>{user.status.replace("_", " ")}</Badge>} />
              <Item k="Opted in" v={user.optedIn ? "Yes" : "No"} />
              <Item k="Registered" v={new Date(user.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })} />
              <Item k="Last active" v={relativeTime(user.lastActive)} />
              <Item k="Messages" v={user.messages.toLocaleString()} />
              <Item k="Language · TZ" v={`${user.language} · ${user.timezone}`} />
            </dl>
          </section>
          <section>
            <h3 className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Preferences & opt-ins</h3>
            <dl className="grid grid-cols-2 gap-y-2.5 text-[12.5px]">
              <Item k="Memory" v={user.memory ? "On" : "Off"} />
              <Item k="Journal" v={user.journal ? "On" : "Off"} />
              <Item k="Check-ins" v={user.checkins.length ? user.checkins.join(", ") : "None"} />
            </dl>
          </section>
          <section>
            <h3 className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Account health</h3>
            <dl className="grid grid-cols-2 gap-y-2.5 text-[12.5px]">
              <Item k="24h window" v={user.windowOpen ? <Badge tone="good">Open</Badge> : <Badge tone="outline">Closed</Badge>} />
              <Item k="Failed sends (7d)" v={user.failedLast7d ? <span className="text-bad">{user.failedLast7d}</span> : "0"} />
            </dl>
            <p className="mt-2 text-[11.5px] text-ink-4">Outside the 24-hour window, only approved templates can be sent.</p>
          </section>
          {perms.manage ? (
            <section>
              <h3 className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Support actions (at the user's request)</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" onClick={() => setAction({ kind: "pause_checkins", title: "Pause check-ins" })} disabled={!user.checkins.length}>
                  Pause check-ins
                </Button>
                <Button size="sm" onClick={() => setAction({ kind: "stop_checkins", title: "Stop check-ins" })} disabled={!user.checkins.length}>
                  Stop check-ins
                </Button>
                <Button size="sm" onClick={() => setAction({ kind: "memory_off", title: "Turn memory off" })} disabled={!user.memory}>
                  Turn memory off
                </Button>
                <Button size="sm" onClick={() => setAction({ kind: "opt_out", title: "Opt user out" })} disabled={user.status === "opted_out"}>
                  Opt out
                </Button>
              </div>
            </section>
          ) : null}
          {perms.memories ? (
            <section>
              <h3 className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Saved memories</h3>
              {mems ? (
                mems.length ? (
                  <div className="space-y-1.5">
                    {mems.map((m) => (
                      <div key={m.id} className="rounded-lg bg-surface-sunken px-2.5 py-1.5 text-[12.5px] text-ink-2">
                        <span className="mr-1.5 text-[10.5px] uppercase text-ink-4">{m.kind}</span>
                        {m.text}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-ink-4">None saved.</p>
                )
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "memories", title: "View saved memories" })}>
                  <Brain className="h-3.5 w-3.5" /> View (audited)
                </Button>
              )}
            </section>
          ) : null}
          {perms.delete ? (
            <section className="border-t border-line pt-5">
              <h3 className="mb-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-4">Data requests</h3>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setAction({ kind: "export", title: "Export user data" })}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button size="sm" variant="danger" onClick={() => setAction({ kind: "delete", title: "Erase all data", danger: true })}>
                  <Trash2 className="h-3.5 w-3.5" /> Erase
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </motion.aside>
      <Dialog
        open={!!action}
        onClose={() => setAction(null)}
        title={action?.title ?? ""}
        description={action?.kind === "delete" ? "Permanently erases messages, memories, journal, consents and check-ins. Aggregate statistics are kept without any link to this person." : "This action is recorded in the audit log with your reason."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button variant={action?.danger ? "danger" : "primary"} onClick={run} loading={busy} disabled={reason.trim().length < (action?.kind === "memories" ? 10 : 5)}>
              Confirm
            </Button>
          </>
        }
      >
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. support ticket #1234 – user asked to stop check-ins" className="text-[13px]" />
      </Dialog>
    </>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-4">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </>
  );
}
