"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RefreshCw, Send } from "lucide-react";
import type { MessageTemplateRow } from "@/lib/db/types";
import { api, toast } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";

const STATUS_TONE = { approved: "good", pending: "warn", rejected: "bad", paused: "warn", draft: "outline", unknown: "outline" } as const;

export function Templates({ templates, canEdit, metaConfigured }: { templates: MessageTemplateRow[]; canEdit: boolean; metaConfigured: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<MessageTemplateRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok, "good");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-5">
        <div>
          <h3 className="text-[14.5px] font-semibold text-ink">Message templates</h3>
          <p className="text-[13px] text-ink-3">Required outside the 24-hour window. Only Meta-approved templates are ever sent.</p>
        </div>
        {canEdit ? (
          <Button size="sm" disabled={!metaConfigured} loading={busy === "sync"} onClick={() => run("sync", () => api("/api/checkins/templates/sync", { body: {} }), "Synced with Meta")} title={metaConfigured ? "" : "Needs WHATSAPP_BUSINESS_ACCOUNT_ID"}>
            <RefreshCw className="h-3.5 w-3.5" /> Sync status
          </Button>
        ) : null}
      </div>
      <div className="mt-4 divide-y divide-line border-t border-line">
        {templates.map((t) => (
          <div key={t.id} className="flex items-start gap-4 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12.5px] font-medium text-ink">{t.name}</span>
                <Badge tone={STATUS_TONE[t.meta_status]}>{t.meta_status}</Badge>
                <Badge tone="outline">{t.category}</Badge>
                <Badge tone="outline">{t.language}</Badge>
                <Badge tone="calm">{t.kind}</Badge>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">{t.body}</p>
            </div>
            {canEdit ? (
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEdit(t)} aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" disabled={!metaConfigured || t.meta_status === "approved" || t.meta_status === "pending"} loading={busy === t.id} onClick={() => run(t.id, () => api(`/api/checkins/templates/${t.id}/submit`, { body: {} }), "Submitted to Meta for review")}>
                  <Send className="h-3.5 w-3.5" /> Submit
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="px-5 py-3 text-[11.5px] text-ink-4">Meta decides the final category. Templates that read as promotional may be reclassified as marketing, which has different pricing and opt-in expectations.</p>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`Edit ${edit?.name ?? ""}`}
        description="Editing returns the template to draft. It must be re-approved by Meta before it can be sent."
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy === "edit"} onClick={() => edit && run("edit", () => api(`/api/checkins/templates/${edit.id}`, { method: "PATCH", body: { body: edit.body, category: edit.category, language: edit.language } }).then(() => setEdit(null)), "Template saved")}>
              Save draft
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="space-y-3">
            <Field label="Body" hint="Keep it short, clearly a check-in the user asked for, and mention how to stop.">
              <Textarea rows={4} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as "utility" | "marketing" })}>
                  <option value="utility">Utility</option>
                  <option value="marketing">Marketing</option>
                </Select>
              </Field>
              <Field label="Language">
                <Input value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })} />
              </Field>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

export function SchedulingSettings({ initial, canEdit }: { initial: { enabled: boolean; quietHoursStart: string; quietHoursEnd: string; maxPerWeek: number }; canEdit: boolean }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between text-[13px] text-ink-2">
        Send check-ins
        <Switch checked={s.enabled} disabled={!canEdit} onChange={(v) => setS({ ...s, enabled: v })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quiet hours from">
          <Input type="time" value={s.quietHoursStart} disabled={!canEdit} onChange={(e) => setS({ ...s, quietHoursStart: e.target.value })} />
        </Field>
        <Field label="until">
          <Input type="time" value={s.quietHoursEnd} disabled={!canEdit} onChange={(e) => setS({ ...s, quietHoursEnd: e.target.value })} />
        </Field>
      </div>
      <Field label="Max check-ins per user per week">
        <Input type="number" min={1} max={21} value={s.maxPerWeek} disabled={!canEdit} onChange={(e) => setS({ ...s, maxPerWeek: Number(e.target.value) })} />
      </Field>
      {canEdit ? (
        <Button
          size="sm"
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/settings", { method: "PATCH", body: { checkins: s } });
              toast("Scheduling saved", "good");
              router.refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), "bad");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      ) : null}
    </div>
  );
}
