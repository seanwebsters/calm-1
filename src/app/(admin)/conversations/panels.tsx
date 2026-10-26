"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, Lock, Search } from "lucide-react";
import { api, toast } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function ListFilters({ models }: { models: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v && v !== "all") p.set(k, v);
    else p.delete(k);
    p.delete("id");
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };
  return (
    <div className="space-y-2 border-b border-line p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set("q", q.trim());
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search anonymised ID" className="h-8 pl-8 text-[13px]" />
      </form>
      <div className="grid grid-cols-2 gap-2">
        <Select className="h-8 text-[12.5px]" value={sp.get("status") ?? "all"} onChange={(e) => set("status", e.target.value)} aria-label="Status">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="closed">Closed</option>
        </Select>
        <Select className="h-8 text-[12.5px]" value={sp.get("severity") ?? "all"} onChange={(e) => set("severity", e.target.value)} aria-label="Safety">
          <option value="all">Any safety</option>
          <option value="flagged">Any flag</option>
          <option value="moderate">Moderate</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
        <Select className="h-8 text-[12.5px]" value={sp.get("days") ?? "all"} onChange={(e) => set("days", e.target.value)} aria-label="Date">
          <option value="all">Any date</option>
          <option value="1">Last 24h</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </Select>
        <Select className="h-8 text-[12.5px]" value={sp.get("model") ?? "all"} onChange={(e) => set("model", e.target.value)} aria-label="Model">
          <option value="all">Any model</option>
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
        <input type="checkbox" checked={sp.get("errors") === "1"} onChange={(e) => set("errors", e.target.checked ? "1" : "")} className="accent-calm-500" /> Failures only
      </label>
    </div>
  );
}

interface TMsg {
  id: string;
  direction: string;
  kind: string;
  text: string;
  at: string;
  status: string;
  latencyMs: number | null;
  severity: string;
  error: string | null;
}

export function TranscriptGate({ id, production, canView, accessEnabled }: { id: string; production: boolean; canView: boolean; accessEnabled: boolean }) {
  const [msgs, setMsgs] = useState<TMsg[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const r = await api<{ messages: TMsg[] }>(`/api/conversations/${id}/transcript`, { body: { reason } });
      setMsgs(r.messages);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  if (msgs)
    return (
      <div className="space-y-2">
        {production ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn">
            <Eye className="h-3.5 w-3.5" /> Access recorded in the audit log. Don't copy content outside this view.
          </div>
        ) : null}
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.direction === "inbound" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-[1.55]", m.direction === "inbound" ? "rounded-br-md bg-calm-500 text-white" : "rounded-bl-md border border-line bg-surface text-ink", m.kind === "system" && "border-dashed")}>
              {m.text || <em className="opacity-70">[{m.kind}]</em>}
              <div className={cn("mt-1 flex gap-2 text-[10.5px]", m.direction === "inbound" ? "text-white/70" : "text-ink-4")}>
                <span>{new Date(m.at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                {m.latencyMs ? <span>{(m.latencyMs / 1000).toFixed(1)}s</span> : null}
                {m.status === "failed" ? <span className="text-bad">failed</span> : null}
                {m.severity !== "none" ? <span>safety: {m.severity}</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    );

  if (!production)
    return (
      <div className="py-16 text-center">
        <Button variant="secondary" onClick={open} loading={busy}>
          <Eye className="h-4 w-4" /> Show test transcript
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-ink-3">
        <Lock className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </div>
      <p className="text-[14px] font-medium text-ink">Message content is private</p>
      {!canView ? (
        <p className="mt-1 text-[13px] text-ink-3">Your role can see operational metadata only. Safety reviewers and administrators can open transcripts with a recorded reason.</p>
      ) : !accessEnabled ? (
        <p className="mt-1 text-[13px] text-ink-3">Transcript access is switched off in Settings → Privacy.</p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-ink-3">Opening a production transcript is logged with your name and reason. Only do this for safety review, a user's support request, or a legal obligation.</p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for access (e.g. safety review of a flagged critical event)" className="mt-4 text-[13px]" rows={3} />
          <Button variant="primary" className="mt-3" onClick={open} loading={busy} disabled={reason.trim().length < 10}>
            Open transcript
          </Button>
        </>
      )}
    </div>
  );
}

const TAGS: { id: string; label: string }[] = [
  { id: "natural", label: "Natural" },
  { id: "specific", label: "Specific" },
  { id: "good_memory_use", label: "Good memory use" },
  { id: "safety_handled_well", label: "Safety handled well" },
  { id: "too_long", label: "Too long" },
  { id: "too_many_questions", label: "Too many questions" },
  { id: "generic", label: "Generic" },
  { id: "missed_context", label: "Missed context" },
  { id: "pushy_exercise", label: "Pushy exercise" },
  { id: "factual_error", label: "Factual error" },
  { id: "safety_concern", label: "Safety concern" },
];

export function ReviewForm({ id }: { id: string }) {
  const [rating, setRating] = useState<"good" | "needs_work" | "bad" | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <div className="flex gap-1.5">
        {(["good", "needs_work", "bad"] as const).map((r) => (
          <button key={r} onClick={() => setRating(r)} className={cn("flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-colors", rating === r ? (r === "good" ? "border-good/30 bg-good-soft text-good" : r === "bad" ? "border-bad/30 bg-bad-soft text-bad" : "border-warn/30 bg-warn-soft text-warn") : "border-line text-ink-3 hover:border-line-strong")}>
            {r === "needs_work" ? "Needs work" : r === "good" ? "Good" : "Poor"}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {TAGS.map((t) => (
          <button key={t.id} onClick={() => setTags((xs) => (xs.includes(t.id) ? xs.filter((x) => x !== t.id) : [...xs, t.id]))}>
            <Badge tone={tags.includes(t.id) ? "calm" : "outline"}>{t.label}</Badge>
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3 w-full justify-center"
        disabled={!rating}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/conversations/${id}/review`, { body: { rating, tags } });
            toast("Review saved", "good");
            setRating(null);
            setTags([]);
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), "bad");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save review
      </Button>
    </div>
  );
}
