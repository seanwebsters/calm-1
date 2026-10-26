"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Lock, Play, RotateCcw, Upload } from "lucide-react";
import type { PersonalityTraits, PromptVersionRow } from "@/lib/db/types";
import { TRAIT_META, renderTraits, wordBudget } from "@/lib/personality/prompt";
import { api, toast } from "@/lib/client";
import { cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Dialog } from "@/components/ui/dialog";

export function PersonalityEditor({ versions, core, perms, llmConfigured }: { versions: PromptVersionRow[]; core: string; perms: { edit: boolean; publish: boolean }; llmConfigured: boolean }) {
  const router = useRouter();
  const published = versions.find((v) => v.status === "published")!;
  const existingDraft = versions.find((v) => v.status === "draft") ?? null;
  const [draft, setDraft] = useState<PromptVersionRow | null>(existingDraft);
  const base = draft ?? published;
  const [instructions, setInstructions] = useState(base.instructions);
  const [traits, setTraits] = useState<PersonalityTraits>(base.traits);
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCore, setShowCore] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState<number | null>(null);
  const dirty = !!draft && (instructions !== draft.instructions || JSON.stringify(traits) !== JSON.stringify(draft.traits) || (notes || null) !== (draft.notes || null));
  const editing = !!draft;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setBusy(null);
    }
  };

  async function startDraft() {
    await run("draft", async () => {
      const r = await api<{ draft: PromptVersionRow }>("/api/personality/draft", { body: {} });
      setDraft(r.draft);
      setInstructions(r.draft.instructions);
      setTraits(r.draft.traits);
      setNotes(r.draft.notes ?? "");
      router.refresh();
    });
  }
  async function save() {
    if (!draft) return;
    await run("save", async () => {
      const r = await api<{ draft: PromptVersionRow }>("/api/personality/draft", { method: "PATCH", body: { id: draft.id, instructions, traits, notes: notes || null } });
      setDraft(r.draft);
      toast(`Draft v${r.draft.version} saved`, "good");
      router.refresh();
    });
  }
  async function publishDraft() {
    if (!draft) return;
    await run("publish", async () => {
      if (dirty) await api("/api/personality/draft", { method: "PATCH", body: { id: draft.id, instructions, traits, notes: notes || null } });
      const r = await api<{ version: PromptVersionRow }>("/api/personality/publish", { body: { id: draft.id } });
      toast(`v${r.version.version} is live on WhatsApp`, "good");
      setDraft(null);
      router.refresh();
    });
  }
  async function discard() {
    if (!draft) return;
    await run("discard", async () => {
      await api("/api/personality/draft", { method: "DELETE", body: { id: draft.id } });
      setDraft(null);
      setInstructions(published.instructions);
      setTraits(published.traits);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-[1fr_380px] items-start gap-4">
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={editing ? `Draft v${draft!.version}` : `Live · v${published.version}`}
            description={editing ? "Changes don't affect users until published." : `Published ${relativeTime(published.published_at)}. Start a draft to make changes.`}
            action={
              editing ? (
                <>
                  <Button size="sm" variant="ghost" onClick={discard} loading={busy === "discard"}>
                    Discard
                  </Button>
                  <Button size="sm" onClick={save} disabled={!dirty} loading={busy === "save"}>
                    Save draft
                  </Button>
                  {perms.publish ? (
                    <Button size="sm" variant="primary" onClick={publishDraft} loading={busy === "publish"}>
                      <Upload className="h-3.5 w-3.5" /> Publish
                    </Button>
                  ) : null}
                </>
              ) : perms.edit ? (
                <Button size="sm" variant="primary" onClick={startDraft} loading={busy === "draft"}>
                  New draft
                </Button>
              ) : null
            }
          />
          <CardBody className="space-y-5">
            <div>
              <div className="mb-3 text-[12.5px] font-medium text-ink-2">Personality controls</div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                {TRAIT_META.map((t) => (
                  <div key={t.key} title={t.help}>
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-[13px] font-medium text-ink">{t.label}</span>
                      <span className="tabular text-[12px] text-ink-3">{traits[t.key]}</span>
                    </div>
                    <Slider value={traits[t.key]} disabled={!editing} onChange={(v) => setTraits({ ...traits, [t.key]: v })} label={t.label} />
                    <div className="mt-1 flex justify-between text-[11px] text-ink-4">
                      <span>{t.low}</span>
                      <span>{t.high}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12px] text-ink-4">Each control maps to an instruction in the system prompt (see “Rendered settings”). Response length also sets the word budget: {wordBudget(traits)} words.</p>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-ink-2">House style instructions</span>
                <span className="text-[11.5px] text-ink-4">{instructions.length.toLocaleString()} / 8,000</span>
              </div>
              <Textarea rows={16} value={instructions} disabled={!editing} onChange={(e) => setInstructions(e.target.value)} className="font-mono text-[12.5px] leading-[1.6]" />
            </div>
            {editing ? (
              <div>
                <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Change note</div>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed and why" />
              </div>
            ) : null}
          </CardBody>
        </Card>
        <Preview versions={versions} draftValues={editing ? { instructions, traits, label: `Draft v${draft!.version}${dirty ? " (unsaved)" : ""}` } : null} publishedVersion={published.version} enabled={llmConfigured && perms.edit} />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Safety rules" description="Fixed in code. Personality settings can't override them." action={<Lock className="h-4 w-4 text-ink-4" />} />
          <CardBody>
            <ul className="space-y-1.5 text-[12.5px] text-ink-2">
              <li>• Always transparent that Calm-1 is an AI</li>
              <li>• Not an emergency service; points to real help</li>
              <li>• No diagnosis, medication or dosing advice</li>
              <li>• No method, means or self-harm concealment info</li>
              <li>• Avoids dependence; respects autonomy</li>
              <li>• Recommends only verified catalogue content</li>
              <li>• User text can't rewrite these rules</li>
            </ul>
            <button onClick={() => setShowCore(true)} className="mt-3 text-[12.5px] font-medium text-calm-600 hover:underline">
              View core prompt
            </button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rendered settings" description="What the sliders add to the prompt" />
          <CardBody>
            <pre className="whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 font-mono text-[11px] leading-[1.6] text-ink-2">{renderTraits(traits)}</pre>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Version history" action={<History className="h-4 w-4 text-ink-4" />} />
          <CardBody className="px-2 pb-2 pt-2">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-surface-muted">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">v{v.version}</span>
                    <Badge tone={v.status === "published" ? "good" : v.status === "draft" ? "calm" : "outline"}>{v.status}</Badge>
                  </div>
                  <div className="truncate text-[11.5px] text-ink-4">
                    {v.notes ?? "—"} · {v.created_by ?? "system"} · {relativeTime(v.published_at ?? v.created_at)}
                  </div>
                </div>
                {perms.publish && v.status === "archived" ? (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRollback(v.version)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Roll back
                  </Button>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Dialog open={showCore} onClose={() => setShowCore(false)} title="Core prompt (immutable)" width={680}>
        <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-sunken p-4 font-mono text-[11.5px] leading-[1.6] text-ink-2 scroll-thin">{core}</pre>
      </Dialog>
      <Dialog
        open={confirmRollback !== null}
        onClose={() => setConfirmRollback(null)}
        title={`Roll back to v${confirmRollback}?`}
        description={`This publishes a new version that copies v${confirmRollback}'s settings, so history stays linear. Any open draft is discarded.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRollback(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy === "rollback"}
              onClick={() =>
                run("rollback", async () => {
                  const r = await api<{ version: PromptVersionRow }>("/api/personality/rollback", { body: { version: confirmRollback } });
                  toast(`Rolled back – v${r.version.version} is live`, "good");
                  setConfirmRollback(null);
                  setDraft(null);
                  setInstructions(r.version.instructions);
                  setTraits(r.version.traits);
                  router.refresh();
                })
              }
            >
              Roll back
            </Button>
          </>
        }
      />
    </div>
  );
}

function Preview({ versions, draftValues, publishedVersion, enabled }: { versions: PromptVersionRow[]; draftValues: { instructions: string; traits: PersonalityTraits; label: string } | null; publishedVersion: number; enabled: boolean }) {
  const [message, setMessage] = useState("I'm feeling really overwhelmed today.");
  const [history, setHistory] = useState("");
  const [compare, setCompare] = useState<number>(publishedVersion);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ label: string; text: string; latencyMs: number; cost: number }[] | null>(null);
  const others = useMemo(() => versions.filter((v) => v.status !== "draft"), [versions]);
  return (
    <Card>
      <CardHeader title="Preview conversation" description="Same message, side by side. Stateless – nothing is saved and tools are off." />
      <CardBody className="space-y-3">
        <Textarea rows={2} value={history} onChange={(e) => setHistory(e.target.value)} placeholder={"Optional earlier turns, one per line:\nuser: …\nassistant: …"} className="font-mono text-[12px]" />
        <div className="flex gap-2">
          <Input value={message} onChange={(e) => setMessage(e.target.value)} />
          <select value={compare} onChange={(e) => setCompare(Number(e.target.value))} className="h-9 rounded-[10px] border border-line bg-surface px-2 text-[13px]">
            {others.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} {v.status === "published" ? "(live)" : ""}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            disabled={!enabled || !message.trim()}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const hist = history
                  .split("\n")
                  .map((l) => /^(user|assistant):\s*(.+)$/i.exec(l.trim()))
                  .filter(Boolean)
                  .map((m) => ({ role: m![1]!.toLowerCase() as "user" | "assistant", text: m![2]! }));
                const variants = [{ version: compare }, ...(draftValues ? [draftValues] : [])];
                const r = await api<{ results: typeof results }>("/api/personality/preview", { body: { message, history: hist, variants } });
                setResults(r.results);
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), "bad");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Play className="h-3.5 w-3.5" /> Run
          </Button>
        </div>
        {!enabled ? <p className="text-[12px] text-ink-4">Needs ANTHROPIC_API_KEY and edit permission.</p> : null}
        {results ? (
          <div className={cn("grid gap-3", results.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {results.map((r) => (
              <div key={r.label} className="rounded-xl border border-line bg-surface-muted p-3">
                <div className="mb-2 flex items-center justify-between text-[11.5px] text-ink-4">
                  <span className="font-medium text-ink-2">{r.label}</span>
                  <span className="tabular">
                    {(r.latencyMs / 1000).toFixed(1)}s · {r.text.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
                <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2 text-[13px] leading-[1.55] text-ink">{r.text}</div>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
