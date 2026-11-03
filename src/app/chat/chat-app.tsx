"use client";
/**
 * Calm-1 test chat, styled like a WhatsApp conversation so testers get a
 * feel for the real experience. Same engine as the WhatsApp channel; web-only
 * extras (animated breathing, Calm content cards) render under replies.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, MoreVertical, Plus, RotateCcw, SendHorizontal, Smile, X } from "lucide-react";
import { BreathingCard } from "./breathing-card";
import { ContentCards, type ContentItem } from "./content-card";
import { BubblePopCard, FloatAwayCard, GroundingCard, MoodCard, SleepCard } from "./activities";
import { AffirmationCard, BodyScanCard, GratitudeCard, MuscleReleaseCard, SheepCard, SoundsCard, StillnessCard } from "./activities2";
import { cn } from "@/lib/utils";

type Widget =
  | { type: "breathing"; style: string }
  | { type: "content"; items: ContentItem[] }
  | { type: "grounding" }
  | { type: "bubbles" }
  | { type: "floataway" }
  | { type: "mood" }
  | { type: "sleep"; need: string }
  | { type: "sounds" }
  | { type: "bodyscan" }
  | { type: "muscle" }
  | { type: "stillness" }
  | { type: "sheep" }
  | { type: "gratitude" }
  | { type: "affirmation" };

interface Msg {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  widgets?: Widget[];
}

const WIDGETS_KEY = "calm1-chat-widgets-v2";
function savedWidgets(): Record<string, Widget[]> {
  try {
    return JSON.parse(localStorage.getItem(WIDGETS_KEY) ?? "{}") as Record<string, Widget[]>;
  } catch {
    return {};
  }
}
function saveWidgets(id: string, w: Widget[]) {
  try {
    localStorage.setItem(WIDGETS_KEY, JSON.stringify({ ...savedWidgets(), [id]: w }));
  } catch {}
}

/** Render WhatsApp-style *bold*, _italic_ and links; drop links already shown as cards. */
function rich(text: string, hideUrls: Set<string>) {
  const cleaned = hideUrls.size ? text.replace(/https?:\/\/[^\s)]+/g, (u) => (hideUrls.has(u.replace(/[.,;:!?]+$/, "")) ? "" : u)).replace(/\(\s*\)/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : text;
  return cleaned.split(/(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/\S+)/g).map((p, i) =>
    /^\*[^*]+\*$/.test(p) ? (
      <strong key={i}>{p.slice(1, -1)}</strong>
    ) : /^_[^_]+_$/.test(p) ? (
      <em key={i}>{p.slice(1, -1)}</em>
    ) : /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-[#027eb5] underline-offset-2 hover:underline">
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Ticks() {
  return (
    <svg viewBox="0 0 16 11" width="16" height="11" className="ml-1 inline-block shrink-0" aria-label="Read">
      <path d="M11.07.65 4.6 7.12 1.93 4.45.88 5.5l3.72 3.72L12.12 1.7z" fill="#53bdeb" />
      <path d="M15.07.65 8.6 7.12l-.9-.9-1.05 1.05 1.95 1.95L16.12 1.7z" fill="#53bdeb" />
    </svg>
  );
}

/** Activities anyone can start without asking Calm-1 (web test chat only). */
type Activity = { key: string; label: string; emoji: string; color: string; intro: string; widget: Widget; section: "Breathe" | "Calm down" | "Sleep" | "Feel good" };
const ACTIVITIES: Activity[] = [
  { section: "Breathe", key: "slow", label: "Breathe", emoji: "🫧", color: "#5c8fea", intro: "Let's breathe together. Tap start and follow the bubble 🫧", widget: { type: "breathing", style: "slow" } },
  { section: "Breathe", key: "sigh", label: "Calming sigh", emoji: "😮‍💨", color: "#7f66ff", intro: "A calming sigh: two breaths in, one long breath out. Tap start.", widget: { type: "breathing", style: "sigh" } },
  { section: "Breathe", key: "box", label: "Box breath", emoji: "🟦", color: "#2f6fde", intro: "Box breathing: in, hold, out, hold. Tap start when ready.", widget: { type: "breathing", style: "box" } },
  { section: "Breathe", key: "even", label: "Even breath", emoji: "〰️", color: "#00a3a3", intro: "An even 5-5 rhythm. Nothing to force – just follow along.", widget: { type: "breathing", style: "even" } },
  { section: "Calm down", key: "ground", label: "5-4-3-2-1", emoji: "✋", color: "#00a884", intro: "Let's ground you in the room around you. Tap as you notice each thing.", widget: { type: "grounding" } },
  { section: "Calm down", key: "bubbles", label: "Pop bubbles", emoji: "🎈", color: "#e86aa6", intro: "Pop a few bubbles, slowly. Breathe out as you tap.", widget: { type: "bubbles" } },
  { section: "Calm down", key: "muscle", label: "Squeeze & release", emoji: "✊", color: "#f08a5d", intro: "Squeeze and release, one part of your body at a time. Hold the button to squeeze.", widget: { type: "muscle" } },
  { section: "Calm down", key: "bodyscan", label: "Body scan", emoji: "🧍", color: "#3a4a8a", intro: "A one-minute body scan, head to toe. Tap start whenever you're ready.", widget: { type: "bodyscan" } },
  { section: "Calm down", key: "stillness", label: "1 min stillness", emoji: "⏳", color: "#5e8c6a", intro: "One minute of doing nothing at all. A chime will let you know when it's done.", widget: { type: "stillness" } },
  { section: "Calm down", key: "float", label: "Let it go", emoji: "☁️", color: "#4aa8e8", intro: "Type a worry and let it float away. It isn't saved anywhere.", widget: { type: "floataway" } },
  { section: "Sleep", key: "sounds", label: "Calm sounds", emoji: "🌧️", color: "#284b63", intro: "Some calming sounds. Pick one, and set a sleep timer if you like.", widget: { type: "sounds" } },
  { section: "Sleep", key: "sheep", label: "Count sheep", emoji: "🐑", color: "#1e2a5e", intro: "Watch the sheep, breathe out slowly as each one jumps…", widget: { type: "sheep" } },
  { section: "Sleep", key: "sleep", label: "Wind down", emoji: "🌙", color: "#3b3f8f", intro: "Here's a gentle wind-down for tonight. Tick things off as you go.", widget: { type: "sleep", need: "wind_down" } },
  { section: "Sleep", key: "windbreath", label: "Sleep breath", emoji: "💤", color: "#6a5fdc", intro: "Wind-down breathing for bed: in 4, hold 7, out 8.", widget: { type: "breathing", style: "wind_down" } },
  { section: "Feel good", key: "gratitude", label: "Gratitude jar", emoji: "🌟", color: "#e7b43a", intro: "Let's fill a little jar with three good things from today.", widget: { type: "gratitude" } },
  { section: "Feel good", key: "affirm", label: "Kind words", emoji: "💛", color: "#c96ad0", intro: "A gentle reminder for you:", widget: { type: "affirmation" } },
  { section: "Feel good", key: "mood", label: "Mood check", emoji: "🙂", color: "#f2a33a", intro: "Quick check-in:", widget: { type: "mood" } },
];
const SECTIONS: Activity["section"][] = ["Breathe", "Calm down", "Sleep", "Feel good"];
const QUICK = ["slow", "sigh", "ground", "sounds", "bubbles"];

export function ChatApp() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const startActivity = (key: string) => {
    const a = ACTIVITIES.find((x) => x.key === key);
    if (!a) return;
    setSheet(false);
    setMsgs((m) => [...m, { id: `local-${Date.now()}`, direction: "outbound", text: a.intro, at: new Date().toISOString(), widgets: [a.widget] }]);
  };

  const load = async () => {
    const r = await fetch("/api/chat/state", { cache: "no-store" });
    if (!r.ok) return;
    const w = savedWidgets();
    const server = ((await r.json()) as { messages: Msg[] }).messages.map((m) => (w[m.id] ? { ...m, widgets: w[m.id] } : m));
    setMsgs((m) => (server.length >= m.length ? server : m));
  };

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, sending]);

  async function send(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const body = (override ?? text).trim();
    if (!body || sending) return;
    setText("");
    setError(null);
    setSending(true);
    setMsgs((m) => [...m, { id: `tmp-${Date.now()}`, direction: "inbound", text: body, at: new Date().toISOString() }]);
    try {
      const r = await fetch("/api/chat/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) });
      const j = (await r.json()) as { replies?: { id: string; text: string; widgets?: Widget[] }[]; deleted?: boolean; error?: string | null };
      if (!r.ok) throw new Error(j.error ?? "Something went wrong");
      // Show replies straight from the response (don't depend on re-reading storage).
      const replies = (j.replies ?? []).map((x) => {
        if (x.widgets?.length) saveWidgets(x.id, x.widgets);
        return { id: x.id, direction: "outbound" as const, text: x.text, at: new Date().toISOString(), widgets: x.widgets };
      });
      setMsgs((m) => [...m, ...replies]);
      if (j.error) setError(j.error);
      else if (!replies.length) setError("Calm-1 didn't reply. It may not be fully set up yet (the Claude key).");
    } catch (err) {
      setError(err instanceof Error && err.message.includes("Too many") ? "You're sending messages quickly – give it a moment." : "Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    setMenu(false);
    await fetch("/api/chat/reset", { method: "POST" });
    try {
      localStorage.removeItem(WIDGETS_KEY);
    } catch {}
    setMsgs([]);
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#efeae2]">
      {/* Header */}
      <header className="flex items-center gap-2 bg-[#008069] px-2 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] text-white">
        <ChevronLeft className="h-6 w-6 shrink-0 opacity-90" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/calm-icon.png" alt="" className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 pl-1">
          <div className="truncate text-[16.5px] font-medium leading-tight">Calm-1</div>
          <div className="truncate text-[12.5px] text-white/80">{sending ? "typing…" : "online"}</div>
        </div>
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} className="rounded-full p-2 hover:bg-white/10" aria-label="Menu">
            <MoreVertical className="h-5 w-5" />
          </button>
          {menu ? (
            <div className="absolute right-1 top-11 z-20 w-52 rounded-lg bg-white py-1.5 text-[#111b21] shadow-pop">
              <button onClick={reset} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[14.5px] hover:bg-[#f5f6f6]">
                <RotateCcw className="h-4 w-4 text-[#54656f]" /> Clear chat & start over
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Conversation */}
      <main
        className="flex-1 overflow-y-auto px-[10px] py-3"
        onClick={() => setMenu(false)}
        style={{
          backgroundImage: "radial-gradient(rgba(84,101,111,0.08) 1.2px, transparent 1.2px), radial-gradient(rgba(84,101,111,0.05) 1.2px, transparent 1.2px)",
          backgroundSize: "22px 22px, 22px 22px",
          backgroundPosition: "0 0, 11px 11px",
        }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-[3px]">
          <div className="mx-auto mb-2 rounded-lg bg-white/90 px-3 py-1 text-[12.5px] text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">Today</div>
          <div className="mx-auto mb-3 max-w-[90%] rounded-lg bg-[#ffeecd] px-3 py-1.5 text-center text-[12.5px] leading-snug text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            🔒 You're chatting with Calm-1, an AI companion (test version). Not an emergency service – in an emergency call 999.
          </div>

          {msgs.length === 0 && !sending ? (
            <div className="mx-auto mt-10 flex max-w-xs flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/calm-icon.png" alt="Calm" className="h-16 w-16 rounded-2xl shadow-card" />
              <p className="mt-3 text-[16px] font-medium text-[#111b21]">Calm, just a message away.</p>
              <p className="mt-1 text-[13.5px] text-[#54656f]">Say hi to start.</p>
            </div>
          ) : null}

          {msgs.map((m, i) => {
            const mine = m.direction === "inbound";
            const first = i === 0 || msgs[i - 1]!.direction !== m.direction;
            const cardUrls = new Set((m.widgets ?? []).flatMap((w) => (w.type === "content" ? w.items.map((x) => x.url) : [])));
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }} className={cn("flex flex-col", mine ? "items-end" : "items-start", first && i > 0 ? "mt-2" : "")}>
                <div
                  className={cn(
                    "relative max-w-[85%] whitespace-pre-wrap break-words rounded-[7.5px] px-[9px] pb-[6px] pt-[6px] text-[14.6px] leading-[1.38] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
                    mine ? "bg-[#d9fdd3]" : "bg-white",
                    first ? (mine ? "rounded-tr-none" : "rounded-tl-none") : "",
                  )}
                >
                  {first ? (
                    <svg viewBox="0 0 8 13" width="8" height="13" className={cn("absolute top-0", mine ? "-right-[8px]" : "-left-[8px] -scale-x-100")} aria-hidden>
                      <path d="M0 0h8L0 13z" fill={mine ? "#d9fdd3" : "#ffffff"} transform={mine ? "" : ""} />
                    </svg>
                  ) : null}
                  <span>{rich(m.text, cardUrls)}</span>
                  <span className="float-right ml-3 mt-[6px] flex translate-y-[3px] items-center text-[11px] leading-none text-[#667781]">
                    {time(m.at)}
                    {mine ? <Ticks /> : null}
                  </span>
                </div>
                {(m.widgets ?? []).map((w, wi) => {
                  switch (w.type) {
                    case "breathing":
                      return <BreathingCard key={wi} style={w.style} />;
                    case "content":
                      return <ContentCards key={wi} items={w.items} />;
                    case "grounding":
                      return <GroundingCard key={wi} />;
                    case "bubbles":
                      return <BubblePopCard key={wi} />;
                    case "floataway":
                      return <FloatAwayCard key={wi} />;
                    case "mood":
                      return <MoodCard key={wi} onPick={(t) => void send(undefined, t)} />;
                    case "sleep":
                      return <SleepCard key={wi} need={w.need} />;
                    case "sounds":
                      return <SoundsCard key={wi} />;
                    case "bodyscan":
                      return <BodyScanCard key={wi} />;
                    case "muscle":
                      return <MuscleReleaseCard key={wi} />;
                    case "stillness":
                      return <StillnessCard key={wi} />;
                    case "sheep":
                      return <SheepCard key={wi} />;
                    case "gratitude":
                      return <GratitudeCard key={wi} />;
                    case "affirmation":
                      return <AffirmationCard key={wi} />;
                  }
                })}
              </motion.div>
            );
          })}

          <AnimatePresence>
            {sending ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 flex">
                <div className="relative flex gap-1 rounded-[7.5px] rounded-tl-none bg-white px-4 py-3 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="h-2 w-2 rounded-full bg-[#8696a0]" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.18 }} />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {error ? <p className="mx-auto mt-2 max-w-[90%] rounded-lg bg-white/90 px-3 py-1.5 text-center text-[12.5px] text-[#ea0038]">{error}</p> : null}
          <div ref={end} className="h-1" />
        </div>
      </main>

      {/* Composer */}
      <form onSubmit={send} className="bg-[#f0f2f5] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
        <div className="mx-auto mb-1.5 flex max-w-2xl gap-1.5 overflow-x-auto px-0.5 pb-0.5">
          {QUICK.map((k) => {
            const a = ACTIVITIES.find((x) => x.key === k)!;
            return (
              <button key={k} type="button" onClick={() => startActivity(k)} className="whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[12.5px] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                {a.emoji} {a.label}
              </button>
            );
          })}
          <button type="button" onClick={() => setSheet(true)} className="whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#008069] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            More…
          </button>
        </div>
        <div className="mx-auto flex max-w-2xl items-end gap-1.5">
          <button type="button" onClick={() => setSheet(true)} className="mb-[1px] flex h-[42px] w-9 shrink-0 items-center justify-center text-[#54656f]" aria-label="Activities">
            <Plus className="h-6 w-6" />
          </button>
          <div className="flex min-h-[44px] flex-1 items-end rounded-[22px] bg-white px-3 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            <Smile className="mb-[11px] mr-2 h-[22px] w-[22px] shrink-0 text-[#54656f]" aria-hidden />
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
              placeholder="Message"
              aria-label="Message"
              className="max-h-32 flex-1 resize-none bg-transparent py-[11px] text-[16px] text-[#111b21] placeholder:text-[#8696a0] focus:outline-none focus-visible:shadow-none"
            />
          </div>
          <button type="submit" disabled={!text.trim() || sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-opacity disabled:opacity-60" aria-label="Send">
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>
      </form>

      <AnimatePresence>
        {sheet ? (
          <motion.div className="fixed inset-0 z-30 flex items-end bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)}>
            <motion.div
              className="w-full rounded-t-3xl bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[15px] font-semibold text-[#111b21]">Take a moment</div>
                <button onClick={() => setSheet(false)} className="rounded-full p-1.5 text-[#54656f] hover:bg-[#f0f2f5]" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[62vh] space-y-4 overflow-y-auto pb-2">
                {SECTIONS.map((sec) => (
                  <div key={sec}>
                    <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8696a0]">{sec}</div>
                    <div className="grid grid-cols-4 gap-x-2 gap-y-3">
                      {ACTIVITIES.filter((a) => a.section === sec).map((a) => (
                        <button key={a.key} onClick={() => startActivity(a.key)} className="flex flex-col items-center gap-1.5">
                          <span className="flex h-14 w-14 items-center justify-center rounded-full text-[24px] shadow-sm" style={{ background: a.color }}>
                            {a.emoji}
                          </span>
                          <span className="text-center text-[11.5px] leading-tight text-[#54656f]">{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
