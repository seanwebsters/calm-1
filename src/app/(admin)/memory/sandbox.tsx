"use client";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { api, toast } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Cand {
  kind: string;
  text: string;
  event_date: string | null;
  confidence: number;
  sensitive_category: string;
}

export function ExtractionSandbox({ configured }: { configured: boolean }) {
  const [text, setText] = useState("I've got a huge presentation on Thursday. Box breathing really helped last time. Oh and call me Sam.");
  const [tz, setTz] = useState("Europe/London");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ accepted: Cand[]; rejected: { candidate: Cand; reason: string }[]; latencyMs: number } | null>(null);
  return (
    <div className="space-y-3">
      <Field label="User message">
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="flex items-end gap-2">
        <Field label="Timezone" className="flex-1">
          <Input value={tz} onChange={(e) => setTz(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          loading={busy}
          disabled={!configured}
          onClick={async () => {
            setBusy(true);
            try {
              setRes(await api("/api/memory/sandbox", { body: { text, timezone: tz } }));
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), "bad");
            } finally {
              setBusy(false);
            }
          }}
        >
          Run extraction
        </Button>
      </div>
      {!configured ? <p className="text-[12.5px] text-ink-4">Needs ANTHROPIC_API_KEY – extraction uses Claude with a strict JSON schema.</p> : null}
      {res ? (
        <div className="space-y-1.5">
          <div className="text-[12px] text-ink-4">{(res.latencyMs / 1000).toFixed(2)}s · dry run, nothing stored</div>
          {[...res.accepted.map((c) => ({ c, ok: true, reason: "" })), ...res.rejected.map((r) => ({ c: r.candidate, ok: false, reason: r.reason }))].map(({ c, ok, reason }, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]">
              {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
              <div className="min-w-0 flex-1">
                <div className="text-ink">{c.text}</div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <Badge tone="outline">{c.kind}</Badge>
                  {c.event_date ? <Badge tone="calm">{c.event_date}</Badge> : null}
                  <Badge tone="outline">conf {c.confidence.toFixed(2)}</Badge>
                  {!ok ? <Badge tone="bad">{reason}</Badge> : null}
                </div>
              </div>
            </div>
          ))}
          {!res.accepted.length && !res.rejected.length ? <p className="text-[12.5px] text-ink-3">Nothing worth remembering – which is the right answer for most messages.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function RetrievalSandbox() {
  const [mems, setMems] = useState("name | Likes to be called Sam\nevent | Has a big presentation at work | " + new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) + "\ntechnique | Finds box breathing helpful when stressed\ncontext | Has a dog called Max");
  const [msg, setMsg] = useState("Feeling stressed this morning");
  const [res, setRes] = useState<{ picked: { kind: string; text: string; reason: string; days_until?: number }[]; rendered: string; today: string } | null>(null);
  return (
    <div className="space-y-3">
      <Field label="Saved memories" hint="One per line: kind | text | optional YYYY-MM-DD">
        <Textarea rows={5} value={mems} onChange={(e) => setMems(e.target.value)} className="font-mono text-[12px]" />
      </Field>
      <div className="flex items-end gap-2">
        <Field label="Incoming message" className="flex-1">
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} />
        </Field>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const memories = mems
                .split("\n")
                .map((l) => l.split("|").map((s) => s.trim()))
                .filter((p) => p.length >= 2 && p[1])
                .map(([kind, text, date]) => ({ kind, text, event_date: date || null }));
              setRes(await api("/api/memory/retrieve", { body: { memories, message: msg } }));
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), "bad");
            }
          }}
        >
          Test retrieval
        </Button>
      </div>
      {res ? (
        <div>
          <div className="mb-1.5 text-[12px] text-ink-4">Today in that timezone: {res.today}</div>
          <pre className="whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 font-mono text-[11.5px] leading-5 text-ink-2">{res.rendered || "(no memories selected – nothing added to context)"}</pre>
        </div>
      ) : null}
    </div>
  );
}
