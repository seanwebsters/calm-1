"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Library, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import type { ContentItemRow } from "@/lib/db/types";
import { api, toast } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";

const CATS = ["sleep", "meditation", "breathing", "music", "stories", "movement", "focus"] as const;
type Draft = { title: string; description: string; category: (typeof CATS)[number]; duration_minutes: number | null; url: string; language: string; available: boolean; verified: boolean; tags: string };
const EMPTY: Draft = { title: "", description: "", category: "sleep", duration_minutes: null, url: "https://", language: "en", available: true, verified: false, tags: "" };

export function ContentManager({ items, canEdit }: { items: ContentItemRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState<{ id: string | null; d: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("help me sleep");
  const [preview, setPreview] = useState<ContentItemRow[] | null>(null);

  const shown = useMemo(() => items.filter((i) => (cat === "all" || i.category === cat) && (!filter || `${i.title} ${i.tags.join(" ")}`.toLowerCase().includes(filter.toLowerCase()))), [items, cat, filter]);
  const live = items.filter((i) => i.verified && i.available).length;

  async function save() {
    if (!editing) return;
    setBusy(true);
    const body = { ...editing.d, tags: editing.d.tags.split(",").map((t) => t.trim()).filter(Boolean), duration_minutes: editing.d.duration_minutes || null };
    try {
      if (editing.id) await api(`/api/content/${editing.id}`, { method: "PATCH", body });
      else await api("/api/content", { body });
      toast(editing.id ? "Saved" : "Added to catalogue", "good");
      setEditing(null);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, p: Partial<ContentItemRow>) {
    try {
      await api(`/api/content/${id}`, { method: "PATCH", body: p });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    }
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-[1fr_360px] gap-4">
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <div>
              <h3 className="text-[14.5px] font-semibold text-ink">Catalogue</h3>
              <p className="text-[13px] text-ink-3">
                {live} of {items.length} items are live (verified and available) and can be recommended.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" className="h-8 w-44 text-[13px]" />
              <Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-8 w-36 text-[13px]">
                <option value="all">All categories</option>
                {CATS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              {canEdit ? (
                <Button size="sm" variant="primary" onClick={() => setEditing({ id: null, d: EMPTY })}>
                  <Plus className="h-3.5 w-3.5" /> Add item
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-4">
            {shown.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Title</TH>
                    <TH>Category</TH>
                    <TH>Duration</TH>
                    <TH>Lang</TH>
                    <TH>Verified</TH>
                    <TH>Available</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {shown.map((i) => (
                    <TR key={i.id}>
                      <TD className="max-w-[340px]">
                        <div className="truncate font-medium text-ink">{i.title}</div>
                        <div className="truncate text-[12px] text-ink-4">{i.tags.join(" · ") || i.description}</div>
                      </TD>
                      <TD>
                        <Badge tone="outline">{i.category}</Badge>
                      </TD>
                      <TD className="tabular text-ink-3">{i.duration_minutes ? `${i.duration_minutes} min` : "—"}</TD>
                      <TD className="uppercase text-ink-3">{i.language}</TD>
                      <TD>
                        <Switch checked={i.verified} disabled={!canEdit} onChange={(v) => patch(i.id, { verified: v })} label="Verified" />
                      </TD>
                      <TD>
                        <Switch checked={i.available} disabled={!canEdit} onChange={(v) => patch(i.id, { available: v })} label="Available" />
                      </TD>
                      <TD className="whitespace-nowrap text-right">
                        <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex rounded-lg p-1.5 text-ink-4 hover:bg-surface-sunken hover:text-ink" aria-label="Open link">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {canEdit ? (
                          <>
                            <button onClick={() => setEditing({ id: i.id, d: { title: i.title, description: i.description, category: i.category, duration_minutes: i.duration_minutes, url: i.url, language: i.language, available: i.available, verified: i.verified, tags: i.tags.join(", ") } })} className="inline-flex rounded-lg p-1.5 text-ink-4 hover:bg-surface-sunken hover:text-ink" aria-label="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete “${i.title}”?`)) return;
                                await api(`/api/content/${i.id}`, { method: "DELETE" });
                                router.refresh();
                              }}
                              className="inline-flex rounded-lg p-1.5 text-ink-4 hover:bg-bad-soft hover:text-bad"
                              aria-label="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState icon={Library} title="No content" />
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h3 className="text-[14.5px] font-semibold text-ink">Recommendation preview</h3>
            <p className="mt-0.5 text-[13px] text-ink-3">Exactly what the search_calm_content tool returns to Claude.</p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await api<{ items: ContentItemRow[] }>("/api/content/search", { body: { query: q } });
                setPreview(r.items);
              }}
            >
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="text-[13px]" />
              <Button type="submit" size="md" variant="secondary" aria-label="Search">
                <Search className="h-4 w-4" />
              </Button>
            </form>
            {preview ? (
              <div className="mt-3 space-y-1.5">
                {preview.length ? (
                  preview.map((p) => (
                    <div key={p.id} className="rounded-lg bg-surface-sunken px-3 py-2 text-[12.5px]">
                      <div className="font-medium text-ink">{p.title}</div>
                      <div className="truncate text-ink-4">{p.url}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-[12.5px] text-ink-3">No live items match – Calm-1 will say so rather than invent something.</p>
                )}
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <ShieldCheck className="h-4 w-4 text-calm-600" strokeWidth={1.75} /> Guardrails
            </div>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-ink-3">
              <li>• Only verified + available items are visible to the model.</li>
              <li>• Replies are scanned and any link not in the live catalogue is removed and logged.</li>
              <li>• Starter rows are examples: replace each with an approved Calm title and link, then verify it.</li>
            </ul>
          </div>
        </div>
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit content" : "Add content"}
        width={560}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title" className="col-span-2">
              <Input value={editing.d.title} onChange={(e) => setEditing({ ...editing, d: { ...editing.d, title: e.target.value } })} />
            </Field>
            <Field label="Description" className="col-span-2">
              <Textarea rows={2} value={editing.d.description} onChange={(e) => setEditing({ ...editing, d: { ...editing.d, description: e.target.value } })} />
            </Field>
            <Field label="URL (https)" className="col-span-2">
              <Input value={editing.d.url} onChange={(e) => setEditing({ ...editing, d: { ...editing.d, url: e.target.value } })} />
            </Field>
            <Field label="Category">
              <Select value={editing.d.category} onChange={(e) => setEditing({ ...editing, d: { ...editing.d, category: e.target.value as Draft["category"] } })}>
                {CATS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" min={1} value={editing.d.duration_minutes ?? ""} onChange={(e) => setEditing({ ...editing, d: { ...editing.d, duration_minutes: e.target.value ? Number(e.target.value) : null } })} />
            </Field>
            <Field label="Language">
              <Input value={editing.d.language} onChange={(e) => setEditing({ ...editing, d: { ...editing.d, language: e.target.value } })} />
            </Field>
            <Field label="Tags (comma separated)">
              <Input value={editing.d.tags} onChange={(e) => setEditing({ ...editing, d: { ...editing.d, tags: e.target.value } })} />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <Switch checked={editing.d.verified} onChange={(v) => setEditing({ ...editing, d: { ...editing.d, verified: v } })} /> Verified by content team
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <Switch checked={editing.d.available} onChange={(v) => setEditing({ ...editing, d: { ...editing.d, available: v } })} /> Available
            </label>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
