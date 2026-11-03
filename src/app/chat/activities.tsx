"use client";
/**
 * Interactive, animated wellbeing activities for the web test chat. They
 * mirror the vetted scripts in lib/tools/exercises.ts; nothing typed into
 * them is sent or stored.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const card = "mt-1.5 w-full max-w-[320px] overflow-hidden rounded-3xl border border-white/60 p-4 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]";

/* ------------------------------------------------------------ 5-4-3-2-1 */

const SENSES = [
  { n: 5, verb: "see", emoji: "👀", hint: "Look around – colours, shapes, light." },
  { n: 4, verb: "feel", emoji: "✋", hint: "Feet on the floor, clothes on your skin." },
  { n: 3, verb: "hear", emoji: "👂", hint: "Near and far – even quiet hums." },
  { n: 2, verb: "smell", emoji: "👃", hint: "Or two smells you like." },
  { n: 1, verb: "taste", emoji: "👅", hint: "Or take a sip of water." },
];

export function GroundingCard() {
  const [step, setStep] = useState(0);
  const [taps, setTaps] = useState(0);
  const done = step >= SENSES.length;
  const s = SENSES[Math.min(step, SENSES.length - 1)]!;
  const tap = () => {
    if (done) return;
    if (taps + 1 >= s.n) {
      setTaps(0);
      setStep((x) => x + 1);
    } else setTaps((t) => t + 1);
  };
  return (
    <div className={cn(card, "bg-gradient-to-b from-[#e6f6f1] to-[#eaf2fd]")}>
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold text-ink">5-4-3-2-1 grounding</div>
        <div className="flex gap-1">
          {SENSES.map((x, i) => (
            <span key={x.n} className={cn("h-1.5 w-5 rounded-full transition-colors", i < step ? "bg-[#00a884]" : i === step ? "bg-[#00a884]/40" : "bg-ink/10")} />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center">
            <div className="text-[40px]">🌿</div>
            <div className="mt-2 text-[15px] font-semibold text-ink">You're here, right now.</div>
            <div className="mt-1 text-[13px] text-ink-3">Notice your breath for a moment before you carry on.</div>
            <button onClick={() => setStep(0)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] shadow-card">
              <RotateCcw className="h-3.5 w-3.5" /> Again
            </button>
          </motion.div>
        ) : (
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="pt-4 text-center">
            <div className="text-[34px]">{s.emoji}</div>
            <div className="mt-1 text-[17px] font-semibold text-ink">
              Notice {s.n} thing{s.n > 1 ? "s" : ""} you can {s.verb}
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-3">{s.hint}</div>
            <div className="mt-4 flex justify-center gap-2.5">
              {Array.from({ length: s.n }, (_, i) => (
                <motion.button
                  key={i}
                  onClick={tap}
                  aria-label={`Noticed ${i + 1}`}
                  className={cn("flex h-11 w-11 items-center justify-center rounded-full border-2 text-white", i < taps ? "border-[#00a884] bg-[#00a884]" : "border-[#00a884]/40 bg-white")}
                  whileTap={{ scale: 0.85 }}
                  animate={i < taps ? { scale: [1, 1.2, 1] } : {}}
                >
                  {i < taps ? <Check className="h-5 w-5" /> : null}
                </motion.button>
              ))}
            </div>
            <div className="mt-3 text-[11.5px] text-ink-4">Tap a circle each time you notice one</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------- Bubble popping */

interface Bubble {
  id: number;
  x: number;
  size: number;
  dur: number;
  hue: number;
}

export function BubblePopCard() {
  const reduce = useReducedMotion();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [popped, setPopped] = useState<{ id: number; x: number; y: number }[]>([]);
  const [count, setCount] = useState(0);
  const next = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const add = () =>
      setBubbles((b) => [...b.slice(-14), { id: next.current++, x: 8 + Math.random() * 78, size: 34 + Math.random() * 30, dur: reduce ? 14 : 7 + Math.random() * 5, hue: 200 + Math.random() * 60 }]);
    for (let i = 0; i < 4; i++) setTimeout(add, i * 400);
    const t = setInterval(add, 1100);
    return () => clearInterval(t);
  }, [reduce]);

  const pop = (b: Bubble, e: React.MouseEvent) => {
    const r = box.current?.getBoundingClientRect();
    setPopped((p) => [...p.slice(-6), { id: b.id, x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }]);
    setBubbles((x) => x.filter((y) => y.id !== b.id));
    setCount((c) => c + 1);
    if (navigator.vibrate) navigator.vibrate(8);
  };

  return (
    <div className={cn(card, "bg-gradient-to-b from-[#dff1ff] to-[#efe6ff] p-0")}>
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="text-[13.5px] font-semibold text-ink">Pop the bubbles</div>
        <div className="tabular text-[12px] text-ink-3">{count} popped</div>
      </div>
      <div ref={box} className="relative mt-2 h-[260px] overflow-hidden">
        {bubbles.map((b) => (
          <motion.button
            key={b.id}
            onClick={(e) => pop(b, e)}
            aria-label="Pop bubble"
            className="absolute bottom-0 rounded-full"
            style={{
              left: `${b.x}%`,
              width: b.size,
              height: b.size,
              background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.95) 0 12%, hsla(${b.hue},90%,85%,0.55) 30%, hsla(${b.hue},80%,70%,0.35) 70%, hsla(${b.hue},80%,65%,0.6) 100%)`,
              boxShadow: `inset 0 0 8px rgba(255,255,255,0.8), 0 4px 12px hsla(${b.hue},70%,60%,0.25)`,
            }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: -300, opacity: [0, 1, 1, 0.9], x: [0, 10, -8, 6] }}
            transition={{ duration: b.dur, ease: "linear" }}
            onAnimationComplete={() => setBubbles((x) => x.filter((y) => y.id !== b.id))}
          />
        ))}
        <AnimatePresence>
          {popped.map((p) => (
            <motion.span key={p.id} className="pointer-events-none absolute text-[12px] font-semibold text-calm-600" style={{ left: p.x - 8, top: p.y - 10 }} initial={{ opacity: 1, scale: 0.6 }} animate={{ opacity: 0, scale: 1.6, y: -16 }} transition={{ duration: 0.6 }} onAnimationComplete={() => setPopped((x) => x.filter((y) => y.id !== p.id))}>
              ✦
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <p className="px-4 pb-3 text-center text-[11.5px] text-ink-4">No goal, no score to beat. Just pop slowly and breathe out as you tap.</p>
    </div>
  );
}

/* ----------------------------------------------------- Let it float away */

export function FloatAwayCard() {
  const [text, setText] = useState("");
  const [floating, setFloating] = useState<{ id: number; text: string }[]>([]);
  const [released, setReleased] = useState(0);
  const id = useRef(0);
  const release = () => {
    const t = text.trim();
    if (!t) return;
    setFloating((f) => [...f, { id: id.current++, text: t }]);
    setText("");
    setReleased((r) => r + 1);
  };
  return (
    <div className={cn(card, "relative bg-gradient-to-b from-[#bfe0ff] via-[#dcecff] to-[#f4f8ff]")}>
      <div className="text-[13.5px] font-semibold text-ink">Let it float away</div>
      <div className="mt-0.5 text-[12.5px] text-ink-3">Type a worry or thought, then let it go. It isn't saved or sent anywhere.</div>
      <div className="relative mt-3 h-[150px] overflow-hidden rounded-2xl bg-white/40">
        <motion.div className="absolute left-6 top-6 text-[28px] opacity-70" animate={{ x: [0, 12, 0] }} transition={{ duration: 9, repeat: Infinity }}>
          ☁️
        </motion.div>
        <motion.div className="absolute right-8 top-14 text-[22px] opacity-60" animate={{ x: [0, -10, 0] }} transition={{ duration: 11, repeat: Infinity }}>
          ☁️
        </motion.div>
        <AnimatePresence>
          {floating.map((f) => (
            <motion.div
              key={f.id}
              className="absolute bottom-2 left-1/2 flex max-w-[200px] items-center justify-center rounded-full bg-white/80 px-4 py-2 text-center text-[13px] text-ink-2 shadow-card"
              style={{ x: "-50%" }}
              initial={{ y: 0, opacity: 1, scale: 1 }}
              animate={{ y: -170, opacity: 0, scale: 0.7, rotate: [0, 3, -3, 0] }}
              transition={{ duration: 5, ease: "easeOut" }}
              onAnimationComplete={() => setFloating((x) => x.filter((y) => y.id !== f.id))}
            >
              🎈 {f.text}
            </motion.div>
          ))}
        </AnimatePresence>
        {!floating.length ? <div className="absolute inset-x-0 bottom-3 text-center text-[12px] text-ink-4">{released ? "Gone. Notice how that feels." : "Your balloon will appear here"}</div> : null}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && release()} placeholder="e.g. tomorrow's meeting" maxLength={80} className="h-10 min-w-0 flex-1 rounded-full border border-white bg-white/90 px-4 text-[16px] text-ink placeholder:text-ink-4 focus:outline-none" />
        <button onClick={release} disabled={!text.trim()} className="shrink-0 whitespace-nowrap rounded-full bg-ink px-4 text-[13px] font-medium text-white disabled:opacity-40">
          Let go
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Mood check */

const MOODS = [
  { e: "😣", label: "Struggling", text: "I'm struggling a bit today." },
  { e: "😟", label: "Anxious", text: "I'm feeling anxious." },
  { e: "😐", label: "Meh", text: "I'm feeling a bit meh." },
  { e: "🙂", label: "Okay", text: "I'm doing okay." },
  { e: "😊", label: "Good", text: "I'm feeling good today!" },
];

export function MoodCard({ onPick }: { onPick: (text: string) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className={cn(card, "bg-gradient-to-b from-[#fff3e0] to-[#fdeaf3]")}>
      <div className="text-[13.5px] font-semibold text-ink">How are you feeling right now?</div>
      <div className="mt-3 flex justify-between">
        {MOODS.map((m, i) => (
          <motion.button
            key={m.label}
            whileTap={{ scale: 0.85 }}
            animate={picked === i ? { scale: [1, 1.25, 1.1] } : { scale: picked === null ? 1 : 0.92, opacity: picked === null || picked === i ? 1 : 0.45 }}
            onClick={() => {
              if (picked !== null) return;
              setPicked(i);
              onPick(m.text);
            }}
            className="flex w-[54px] flex-col items-center gap-1"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[26px] shadow-card">{m.e}</span>
            <span className="text-[11px] text-ink-3">{m.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Wind down */

const SLEEP_STEPS: Record<string, { title: string; steps: string[] }> = {
  wind_down: { title: "Wind-down routine", steps: ["Dim the lights, phone face down after this", "Jot down anything still buzzing around", "Three rounds of slow breathing", "Let your body get heavy, toes to forehead"] },
  racing_mind: { title: "Settle a racing mind", steps: ["Name the main worry in a few words – it can wait", "Picture random objects: an apple, a bike, a cloud…", "Still awake after 20 minutes? Get up, low light, something calm"] },
  woke_up: { title: "Woke up in the night", steps: ["Don't check the time", "Breathe out longer than you breathe in", "Rest still counts, even if sleep is slow to return"] },
  bedtime_routine: { title: "Your bedtime routine", steps: ["Pick a consistent time to start winding down", "Same three small steps each night", "Cool, dark and screen-free if you can"] },
};

export function SleepCard({ need = "wind_down" }: { need?: string }) {
  const plan = SLEEP_STEPS[need] ?? SLEEP_STEPS.wind_down!;
  const [done, setDone] = useState<boolean[]>(plan.steps.map(() => false));
  const stars = useMemo(() => Array.from({ length: 22 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, s: 1 + Math.random() * 2, d: 2 + Math.random() * 3 })), []);
  const all = done.every(Boolean);
  return (
    <div className={cn(card, "relative bg-gradient-to-b from-[#141c3d] via-[#26305f] to-[#3b3f8f] text-white")}>
      {stars.map((st, i) => (
        <motion.span key={i} className="absolute rounded-full bg-white" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: st.d, repeat: Infinity, delay: i * 0.15 }} />
      ))}
      <div className="relative">
        <div className="flex items-center gap-2">
          <motion.span className="text-[24px]" animate={{ rotate: [0, -6, 0] }} transition={{ duration: 6, repeat: Infinity }}>
            🌙
          </motion.span>
          <div className="text-[14px] font-semibold">{plan.title}</div>
        </div>
        <div className="mt-3 space-y-2">
          {plan.steps.map((s, i) => (
            <button key={i} onClick={() => setDone((d) => d.map((x, j) => (j === i ? !x : x)))} className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[13.5px] transition-colors", done[i] ? "bg-white/20" : "bg-white/10")}>
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", done[i] ? "border-white bg-white text-[#26305f]" : "border-white/50")}>{done[i] ? <Check className="h-3.5 w-3.5" /> : null}</span>
              <span className={done[i] ? "opacity-70" : ""}>{s}</span>
            </button>
          ))}
        </div>
        <AnimatePresence>{all ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-center text-[13px] text-white/85">All done. Sleep well 💤</motion.div> : null}</AnimatePresence>
      </div>
    </div>
  );
}
