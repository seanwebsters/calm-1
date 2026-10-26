"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, UserPlus } from "lucide-react";
import type { AppSettings } from "@/lib/settings";
import type { AdminUserRow } from "@/lib/db/types";
import { api, toast } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

type Section = keyof AppSettings;

function useSave(section: Section) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const save = async (values: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api("/api/settings", { method: "PATCH", body: { [section]: values } });
      toast("Settings saved", "good");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_280px] items-center gap-6 border-b border-line py-3.5 last:border-0">
      <div>
        <div className="text-[13.5px] font-medium text-ink">{label}</div>
        {hint ? <div className="text-[12.5px] text-ink-4">{hint}</div> : null}
      </div>
      <div className="flex justify-end">{children}</div>
    </div>
  );
}

export function AiForm({ initial, canEdit, models }: { initial: AppSettings["ai"]; canEdit: boolean; models: readonly string[] }) {
  const [s, setS] = useState(initial);
  const { busy, save } = useSave("ai");
  const num = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <div>
      <Row label="Conversation model" hint="Used for every reply.">
        <Select value={s.model} disabled={!canEdit} onChange={(e) => setS({ ...s, model: e.target.value as typeof s.model })}>
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </Row>
      <Row label="Effort" hint="Thinking depth. Low keeps WhatsApp replies fast; raise only if quality measurably improves.">
        <Select value={s.effort} disabled={!canEdit} onChange={(e) => setS({ ...s, effort: e.target.value as typeof s.effort })}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
      </Row>
      <Row label="Background model" hint="Memory extraction, summaries and safety review.">
        <Select value={s.backgroundModel} disabled={!canEdit} onChange={(e) => setS({ ...s, backgroundModel: e.target.value as typeof s.backgroundModel })}>
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </Row>
      <Row label="Max output tokens" hint="Includes thinking. Reply length is shaped by the personality word budget.">
        <Input type="number" value={s.maxOutputTokens} disabled={!canEdit} onChange={num("maxOutputTokens")} />
      </Row>
      <Row label="Request timeout (ms)">
        <Input type="number" value={s.timeoutMs} disabled={!canEdit} onChange={num("timeoutMs")} />
      </Row>
      <Row label="Max tool rounds per reply">
        <Input type="number" value={s.maxToolRounds} disabled={!canEdit} onChange={num("maxToolRounds")} />
      </Row>
      <Row label="History messages in context" hint="Older messages are folded into a rolling summary.">
        <Input type="number" value={s.historyMessages} disabled={!canEdit} onChange={num("historyMessages")} />
      </Row>
      <Row label="Summarise after (messages)">
        <Input type="number" value={s.summariseAfterMessages} disabled={!canEdit} onChange={num("summariseAfterMessages")} />
      </Row>
      <Row label="Memories retrieved per turn">
        <Input type="number" value={s.memoryRetrievalLimit} disabled={!canEdit} onChange={num("memoryRetrievalLimit")} />
      </Row>
      <Row label="Daily AI spend cap (USD)" hint="Replies pause with a polite message when reached. 0 disables the cap.">
        <Input type="number" step="1" value={s.dailyCostLimitUsd} disabled={!canEdit} onChange={num("dailyCostLimitUsd")} />
      </Row>
      <Row label="Replies per user per day">
        <Input type="number" value={s.perUserDailyReplies} disabled={!canEdit} onChange={num("perUserDailyReplies")} />
      </Row>
      <Row label="Model safety review" hint="Second-opinion classification for flagged or ambiguous messages.">
        <Switch checked={s.modelSafetyReview} disabled={!canEdit} onChange={(v) => setS({ ...s, modelSafetyReview: v })} />
      </Row>
      {canEdit ? (
        <div className="pt-4">
          <Button variant="primary" loading={busy} onClick={() => save(s)}>
            Save AI configuration
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PrivacyForm({ initial, canEdit }: { initial: AppSettings["privacy"]; canEdit: boolean }) {
  const [s, setS] = useState(initial);
  const { busy, save } = useSave("privacy");
  const num = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <div>
      <Row label="Message retention (days)" hint="Messages older than this are deleted daily.">
        <Input type="number" value={s.messageRetentionDays} disabled={!canEdit} onChange={num("messageRetentionDays")} />
      </Row>
      <Row label="Event memories expire after (days past the event)">
        <Input type="number" value={s.eventMemoryDays} disabled={!canEdit} onChange={num("eventMemoryDays")} />
      </Row>
      <Row label="Webhook log retention (days)">
        <Input type="number" value={s.webhookRetentionDays} disabled={!canEdit} onChange={num("webhookRetentionDays")} />
      </Row>
      <Row label="Completed job retention (days)">
        <Input type="number" value={s.jobRetentionDays} disabled={!canEdit} onChange={num("jobRetentionDays")} />
      </Row>
      <Row label="Privacy notice version" hint="Recorded with every consent. Bump it when the notice text changes.">
        <Input value={s.noticeVersion} disabled={!canEdit} onChange={(e) => setS({ ...s, noticeVersion: e.target.value })} />
      </Row>
      <Row label="Offer memory during onboarding" hint="Memory stays off unless the user chooses it.">
        <Switch checked={s.offerMemoryAtOnboarding} disabled={!canEdit} onChange={(v) => setS({ ...s, offerMemoryAtOnboarding: v })} />
      </Row>
      <Row label="Allow audited transcript access" hint="Lets safety reviewers and admins open production conversations with a recorded reason.">
        <Switch checked={s.allowTranscriptAccess} disabled={!canEdit} onChange={(v) => setS({ ...s, allowTranscriptAccess: v })} />
      </Row>
      {canEdit ? (
        <div className="pt-4">
          <Button variant="primary" loading={busy} onClick={() => save(s)}>
            Save privacy settings
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function VoiceForm({ initial, canEdit }: { initial: AppSettings["voice"]; canEdit: boolean }) {
  const [s, setS] = useState(initial);
  const { busy, save } = useSave("voice");
  return (
    <div>
      <Row label="Transcribe voice notes" hint="Audio is processed in memory and never stored.">
        <Switch checked={s.transcriptionEnabled} disabled={!canEdit} onChange={(v) => setS({ ...s, transcriptionEnabled: v })} />
      </Row>
      <Row label="Confirm transcription below confidence">
        <Input type="number" step="0.05" min={0} max={1} value={s.confirmBelowConfidence} disabled={!canEdit} onChange={(e) => setS({ ...s, confirmBelowConfidence: Number(e.target.value) })} />
      </Row>
      {canEdit ? (
        <div className="pt-4">
          <Button variant="secondary" loading={busy} onClick={() => save(s)}>
            Save voice settings
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Administrator" },
  { value: "operator", label: "Operator" },
  { value: "safety_reviewer", label: "Safety reviewer" },
  { value: "analyst", label: "Analyst" },
];

export function TeamTable({ admins, canManage, selfId }: { admins: AdminUserRow[]; canManage: boolean; selfId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "operator" });
  const [busy, setBusy] = useState(false);
  const update = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/team/${id}`, { method: "PATCH", body });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    }
  };
  return (
    <div>
      <div className="mb-3 flex justify-end">
        {canManage ? (
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Add team member
          </Button>
        ) : null}
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">
        {admins.map((a) => (
          <div key={a.id} className="flex items-center gap-4 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-calm-50 text-[12px] font-semibold text-calm-700">
              {a.name
                .split(/\s+/)
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium text-ink">
                {a.name} {a.id === selfId ? <span className="text-ink-4">(you)</span> : null}
              </div>
              <div className="text-[12px] text-ink-4">
                {a.email} · {a.auth_user_id ? "linked" : "invited"}
              </div>
            </div>
            {canManage && a.id !== selfId ? (
              <>
                <Select className="h-8 w-44 text-[13px]" value={a.role} onChange={(e) => update(a.id, { role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <Switch checked={a.active} onChange={(v) => update(a.id, { active: v })} label="Active" />
              </>
            ) : (
              <Badge tone="calm">{ROLES.find((r) => r.value === a.role)?.label}</Badge>
            )}
          </div>
        ))}
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add team member"
        description="They sign in with Supabase Auth using this email. Access applies immediately and is logged."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/api/team", { body: form });
                  setOpen(false);
                  router.refresh();
                } catch (e) {
                  toast(e instanceof Error ? e.message : String(e), "bad");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Work email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

export function RetryJob({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        await api(`/api/jobs/${id}/retry`, { body: {} });
        router.refresh();
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" /> Retry
    </Button>
  );
}
