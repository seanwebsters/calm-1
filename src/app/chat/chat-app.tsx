"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreVertical, RotateCcw, Send } from "lucide-react";
import { LogoMark } from "@/components/admin/logo";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  at: string;
}

/** Render WhatsApp-style *bold* and links. */
function rich(text: string) {
  return text.split(/(\*[^*\n]+\*|https?:\/\/\S+)/g).map((p, i) =>
    /^\*[^*]+\*$/.test(p) ? (
      <strong key={i}>{p.slice(1, -1)}</strong>
    ) : /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function ChatApp() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const load = async () => {
    const r = await fetch("/api/chat/state", { cache: "no-store" });
    if (r.ok) setMsgs(((await r.json()) as { messages: Msg[] }).messages);
  };

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, sending]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    setError(null);
    setSending(true);
    const tmp: Msg = { id: `tmp-${Date.now()}`, direction: "inbound", text: body, at: new Date().toISOString() };
    setMsgs((m) => [...m, tmp]);
    try {
      const r = await fetch("/api/chat/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) });
      const j = (await r.json()) as { replies?: { id: string; text: string }[]; deleted?: boolean; error?: string | null };
      if (!r.ok) throw new Error(j.error ?? "Something went wrong");
      if (j.deleted) {
        setMsgs((m) => [...m, ...(j.replies ?? []).map((x) => ({ id: x.id, direction: "outbound" as const, text: x.text, at: new Date().toISOString() }))]);
        return;
      }
      if (j.error) setError(j.error);
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message.includes("Too many") ? "You're sending messages quickly – give it a moment." : "Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    setMenu(false);
    await fetch("/api/chat/reset", { method: "POST" });
    setMsgs([]);
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <LogoMark size={38} />
        <div className="min-w-0 flex-1">
          <div className="text-[15.5px] font-semibold text-ink">Calm-1</div>
          <div className="flex items-center gap-1.5 text-[12px] text-good">
            <span className="h-1.5 w-1.5 rounded-full bg-good" /> Test version
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} className="rounded-full p-2 text-ink-3 hover:bg-surface-sunken" aria-label="Menu">
            <MoreVertical className="h-5 w-5" />
          </button>
          {menu ? (
            <div className="absolute right-0 top-11 z-10 w-48 rounded-xl border border-line bg-surface p-1 shadow-pop">
              <button onClick={reset} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] text-ink-2 hover:bg-surface-sunken">
                <RotateCcw className="h-4 w-4" /> Start over (erase chat)
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-4" onClick={() => setMenu(false)}>
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {msgs.length === 0 && !sending ? (
            <div className="mx-auto mt-16 max-w-xs text-center">
              <LogoMark size={52} />
              <p className="mt-4 text-[17px] font-semibold text-ink">Calm, just a message away.</p>
              <p className="mt-1 text-[14px] text-ink-3">Say hi to start. This is a test version of Calm-1 – it works just like it will on WhatsApp.</p>
            </div>
          ) : null}
          {msgs.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className={cn("flex", m.direction === "inbound" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-[1.45]", m.direction === "inbound" ? "rounded-br-md bg-calm-500 text-white" : "rounded-bl-md border border-line bg-surface text-ink")}>
                {rich(m.text)}
                <div className={cn("mt-0.5 text-right text-[10.5px]", m.direction === "inbound" ? "text-white/70" : "text-ink-4")}>{new Date(m.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </motion.div>
          ))}
          <AnimatePresence>
            {sending ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex">
                <div className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-4" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.18 }} />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {error ? <p className="text-center text-[12.5px] text-bad">{error}</p> : null}
          <div ref={end} />
        </div>
      </main>

      <form onSubmit={send} className="border-t border-line bg-surface px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
        <div className="mx-auto flex max-w-xl items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Message Calm-1…"
            aria-label="Message"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-[22px] border border-line bg-surface-muted px-4 py-[11px] text-[16px] text-ink placeholder:text-ink-4 focus:border-calm-400 focus:outline-none"
          />
          <button type="submit" disabled={!text.trim() || sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-opacity disabled:opacity-40" aria-label="Send">
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-xl text-center text-[11px] text-ink-4">Calm-1 is an AI, not a therapist or emergency service. In an emergency call 999.</p>
      </form>
    </div>
  );
}
