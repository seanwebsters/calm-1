"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, FlaskConical, X } from "lucide-react";
import { api, toast } from "@/lib/client";
import { relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const SEV: Record<string, "calm" | "warn" | "bad" | "neutral"> = { low: "calm", moderate: "warn", high: "bad", critical: "bad" };

export interface EventRow {
  id: string;
  category: string;
  severity: string;
  layer: string;
  rule_id: string | null;
  action: string;
  review_status: string;
  created_at: string;
  anonId: string | null;
  conversation_id: string | null;
  channel: string;
  reviewed_by: string | null;
}

export function ReviewQueue({ events, canReview }: { events: EventRow[]; canReview: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function mark(id: string, review_status: string) {
    setBusy(id);
    try {
      await api(`/api/safety/events/${id}`, { method: "PATCH", body: { review_status } });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setBusy(null);
    }
  }
  if (!events.length) return <p className="px-5 pb-5 text-[13px] text-ink-4">Nothing waiting for review.</p>;
  return (
    <Table>
      <THead>
        <TR>
          <TH>When</TH>
          <TH>Severity</TH>
          <TH>Category</TH>
          <TH>Layer · rule</TH>
          <TH>Action taken</TH>
          <TH>User</TH>
          <TH className="text-right">Review</TH>
        </TR>
      </THead>
      <TBody>
        {events.map((e) => (
          <TR key={e.id}>
            <TD className="whitespace-nowrap text-ink-3">{relativeTime(e.created_at)}</TD>
            <TD>
              <Badge tone={SEV[e.severity] ?? "neutral"}>{e.severity}</Badge>
            </TD>
            <TD className="text-ink">{e.category.replace(/_/g, " ")}</TD>
            <TD className="font-mono text-[11.5px] text-ink-3">
              {e.layer} · {e.rule_id ?? "—"}
            </TD>
            <TD className="text-ink-3">{e.action}</TD>
            <TD>
              {e.conversation_id && e.anonId ? (
                <Link href={`/conversations?source=${e.channel === "whatsapp" ? "production" : e.channel}&id=${e.conversation_id}`} className="font-mono text-[12px] text-calm-600 hover:underline">
                  {e.anonId}
                </Link>
              ) : (
                <span className="text-ink-4">deleted</span>
              )}
              {e.channel !== "whatsapp" ? <Badge tone="outline" className="ml-1.5">{e.channel}</Badge> : null}
            </TD>
            <TD className="whitespace-nowrap text-right">
              {e.review_status === "unreviewed" ? (
                canReview ? (
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" loading={busy === e.id} onClick={() => mark(e.id, "confirmed")}>
                      <Check className="h-3.5 w-3.5" /> Correct
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === e.id} onClick={() => mark(e.id, "false_positive")}>
                      <X className="h-3.5 w-3.5" /> False positive
                    </Button>
                  </div>
                ) : (
                  <Badge tone="outline">unreviewed</Badge>
                )
              ) : (
                <span title={e.reviewed_by ?? ""}>
                  <Badge tone={e.review_status === "confirmed" ? "good" : "warn"}>{e.review_status.replace("_", " ")}</Badge>
                </span>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function EvalRunner({ canRun, llmConfigured }: { canRun: boolean; llmConfigured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(useModel: boolean) {
    setBusy(useModel ? "model" : "rules");
    try {
      const r = await api<{ summary: { passed: number; total: number } }>("/api/safety/eval", { body: { useModel } });
      toast(`Evaluation: ${r.summary.passed}/${r.summary.total} passed`, r.summary.passed === r.summary.total ? "good" : "bad");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setBusy(null);
    }
  }
  if (!canRun) return null;
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => run(false)} loading={busy === "rules"}>
        <FlaskConical className="h-3.5 w-3.5" /> Run (rules)
      </Button>
      <Button size="sm" variant="primary" onClick={() => run(true)} loading={busy === "model"} disabled={!llmConfigured} title={llmConfigured ? "" : "Needs ANTHROPIC_API_KEY"}>
        Run (rules + model)
      </Button>
    </div>
  );
}
