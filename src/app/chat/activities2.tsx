"use client";
/**
 * More interactive activities for the web test chat: calming sounds
 * (generated live with Web Audio – no files), body scan, muscle release,
 * a minute of stillness, counting sheep, a gratitude jar and affirmations.
 * Nothing typed into these is sent or stored.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const card = "mt-1.5 w-full max-w-[320px] overflow-hidden rounded-3xl border border-white/60 p-4 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]";

/* ------------------------------------------------------------ Calm sounds */

type SoundKind = "rain" | "ocean" | "hum";

function noiseBuffer(ctx: AudioContext, kind: "pink" | "brown") {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "pink") {
        b0 = 0.997 * b0 + w * 0.029591;
        b1 = 0.985 * b1 + w * 0.032534;
        b2 = 0.95 * b2 + w * 0.048056;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.5;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    }
  }
  return buf;
}

export function SoundsCard() {
  const [kind, setKind] = useState<SoundKind>("rain");
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [timer, setTimer] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const stopFns = useRef<(() => void)[]>([]);

  const stop = () => {
    stopFns.current.forEach((f) => f());
    stopFns.current = [];
    setPlaying(false);
    setLeft(null);
  };

  const start = (k: SoundKind) => {
    stop();
    const ctx = (ctxRef.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
    void ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2);
    master.connect(ctx.destination);
    gainRef.current = master;
    const nodes: AudioScheduledSourceNode[] = [];
    if (k === "rain") {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, "pink");
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 5000;
      src.connect(hp).connect(lp).connect(master);
      nodes.push(src);
    } else if (k === "ocean") {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, "brown");
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const swell = ctx.createGain();
      swell.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09; // ~11 s per wave
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth).connect(swell.gain);
      src.connect(lp).connect(swell).connect(master);
      nodes.push(src, lfo);
    } else {
      [174, 220, 261.6].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.12 / (i + 1);
        const trem = ctx.createOscillator();
        trem.frequency.value = 0.1 + i * 0.05;
        const td = ctx.createGain();
        td.gain.value = 0.05 / (i + 1);
        trem.connect(td).connect(g.gain);
        o.connect(g).connect(master);
        nodes.push(o, trem);
      });
    }
    nodes.forEach((n) => n.start());
    stopFns.current.push(() => {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.6);
      setTimeout(() => nodes.forEach((n) => n.stop()), 700);
    });
    setKind(k);
    setPlaying(true);
    if (timer) setLeft(timer * 60);
  };

  useEffect(() => {
    if (gainRef.current && ctxRef.current) gainRef.current.gain.setTargetAtTime(volume, ctxRef.current.currentTime, 0.2);
  }, [volume]);

  useEffect(() => {
    if (!playing || left === null) return;
    if (left <= 0) {
      stop();
      return;
    }
    const t = setTimeout(() => setLeft((l) => (l === null ? null : l - 1)), 1000);
    return () => clearTimeout(t);
  }, [playing, left]);

  useEffect(() => () => stop(), []);

  const SOUNDS: { k: SoundKind; label: string; emoji: string }[] = [
    { k: "rain", label: "Rain", emoji: "🌧️" },
    { k: "ocean", label: "Ocean", emoji: "🌊" },
    { k: "hum", label: "Soft hum", emoji: "🎐" },
  ];

  return (
    <div className={cn(card, "bg-gradient-to-b from-[#16324a] to-[#284b63] text-white")}>
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold">Calm sounds</div>
        {left !== null ? <div className="tabular text-[12px] text-white/70">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left</div> : null}
      </div>
      <div className="my-4 flex h-14 items-end justify-center gap-1.5" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <motion.span key={i} className="w-1.5 rounded-full bg-white/70" animate={playing ? { height: [8, 18 + ((i * 7) % 30), 8] } : { height: 6 }} transition={{ duration: kind === "ocean" ? 5 : 1.2 + (i % 4) * 0.3, repeat: playing ? Infinity : 0, delay: i * 0.08, ease: "easeInOut" }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SOUNDS.map((s) => (
          <button key={s.k} onClick={() => (playing && kind === s.k ? stop() : start(s.k))} className={cn("flex flex-col items-center gap-1 rounded-2xl py-2.5 text-[12.5px] transition-colors", playing && kind === s.k ? "bg-white text-[#16324a]" : "bg-white/10")}>
            <span className="text-[22px]">{s.emoji}</span>
            {s.label}
            {playing && kind === s.k ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 opacity-70" />}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[12px]">
        <span className="text-white/70">Volume</span>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="flex-1 accent-white" aria-label="Volume" />
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[12px]">
        <span className="mr-1 text-white/70">Sleep timer</span>
        {[null, 15, 30].map((t) => (
          <button key={String(t)} onClick={() => { setTimer(t); if (playing) setLeft(t ? t * 60 : null); }} className={cn("rounded-full px-2.5 py-1", timer === t ? "bg-white text-[#16324a]" : "bg-white/10")}>
            {t ? `${t} min` : "Off"}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Body scan */

const REGIONS = [
  { key: "head", label: "Your face and jaw", tip: "Soften your forehead. Let your jaw hang loose." },
  { key: "shoulders", label: "Neck and shoulders", tip: "Let your shoulders drop away from your ears." },
  { key: "arms", label: "Arms and hands", tip: "Notice your hands. Let your fingers uncurl." },
  { key: "chest", label: "Chest and belly", tip: "Feel your breath rise and fall. No need to change it." },
  { key: "legs", label: "Hips and legs", tip: "Let your legs feel heavy and supported." },
  { key: "feet", label: "Feet", tip: "Notice where your feet touch the floor or bed." },
];
const SECS = 12;

function Figure({ active }: { active: string | null }) {
  const glow = (k: string) => (active === k ? "#8fb3f5" : "rgba(255,255,255,0.22)");
  return (
    <svg viewBox="0 0 100 200" className="h-[190px]" aria-hidden>
      <defs>
        <filter id="bs-glow">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {[
        ["head", <circle key="h" cx="50" cy="22" r="14" />],
        ["shoulders", <rect key="s" x="30" y="38" width="40" height="10" rx="5" />],
        ["arms", <g key="a"><rect x="17" y="44" width="10" height="56" rx="5" /><rect x="73" y="44" width="10" height="56" rx="5" /></g>],
        ["chest", <rect key="c" x="32" y="48" width="36" height="48" rx="10" />],
        ["legs", <g key="l"><rect x="34" y="96" width="13" height="78" rx="6" /><rect x="53" y="96" width="13" height="78" rx="6" /></g>],
        ["feet", <g key="f"><ellipse cx="40" cy="180" rx="9" ry="5" /><ellipse cx="60" cy="180" rx="9" ry="5" /></g>],
      ].map(([k, el]) => (
        <g key={k as string}>
          {active === k ? <g fill="#8fb3f5" filter="url(#bs-glow)" opacity={0.9}>{el as React.ReactNode}</g> : null}
          <g fill={glow(k as string)} style={{ transition: "fill .6s" }}>{el as React.ReactNode}</g>
        </g>
      ))}
    </svg>
  );
}

export function BodyScanCard() {
  const [i, setI] = useState<number | null>(null);
  const [t, setT] = useState(0);
  const done = i !== null && i >= REGIONS.length;
  useEffect(() => {
    if (i === null || done) return;
    const id = setInterval(() => {
      setT((x) => {
        if (x + 1 >= SECS) {
          setI((v) => (v === null ? v : v + 1));
          return 0;
        }
        return x + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [i, done]);
  const r = i !== null && !done ? REGIONS[i]! : null;
  return (
    <div className={cn(card, "bg-gradient-to-b from-[#1d2b55] to-[#3a4a8a] text-white")}>
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold">Body scan · 1 minute</div>
        {r ? <div className="text-[12px] text-white/70">{i! + 1} / {REGIONS.length}</div> : null}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Figure active={r?.key ?? null} />
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={r?.key ?? (done ? "done" : "idle")} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.4 }}>
              {r ? (
                <>
                  <div className="text-[15px] font-semibold">{r.label}</div>
                  <div className="mt-1 text-[13px] leading-snug text-white/80">{r.tip}</div>
                  <div className="mt-3 h-1 rounded-full bg-white/15">
                    <motion.div className="h-1 rounded-full bg-white/80" animate={{ width: `${((t + 1) / SECS) * 100}%` }} transition={{ duration: 1, ease: "linear" }} />
                  </div>
                </>
              ) : done ? (
                <>
                  <div className="text-[15px] font-semibold">That's your whole body.</div>
                  <div className="mt-1 text-[13px] text-white/80">Take one slow breath before you carry on.</div>
                </>
              ) : (
                <>
                  <div className="text-[15px] font-semibold">Find a comfy spot</div>
                  <div className="mt-1 text-[13px] text-white/80">We'll move slowly from head to toe, about 12 seconds each.</div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-2 flex justify-center">
        <button onClick={() => { setI(done || i === null ? 0 : null); setT(0); }} className="flex items-center gap-1.5 rounded-full bg-white px-5 py-2 text-[13px] font-medium text-[#1d2b55]">
          {done ? <RotateCcw className="h-3.5 w-3.5" /> : i === null ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {done ? "Again" : i === null ? "Start" : "Stop"}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Muscle release */

const MUSCLES = [
  { part: "Hands", how: "Make tight fists" },
  { part: "Shoulders", how: "Lift them up to your ears" },
  { part: "Face", how: "Scrunch up your whole face" },
  { part: "Feet", how: "Curl your toes" },
];

export function MuscleReleaseCard() {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"ready" | "squeeze" | "release">("ready");
  const [p, setP] = useState(0);
  const raf = useRef<number | null>(null);
  const startAt = useRef(0);
  const done = step >= MUSCLES.length;
  const m = MUSCLES[Math.min(step, MUSCLES.length - 1)]!;

  const releaseRef = useRef<() => void>(() => {});
  const down = () => {
    if (done || phase === "release") return;
    setPhase("squeeze");
    startAt.current = performance.now();
    const tick = () => {
      const v = Math.min(1, (performance.now() - startAt.current) / 5000);
      setP(v);
      if (v < 1) raf.current = requestAnimationFrame(tick);
      else releaseRef.current();
    };
    raf.current = requestAnimationFrame(tick);
  };
  const up = () => {
    if (phase !== "squeeze" && !raf.current) return;
    if (phase === "release") return;
    if (raf.current) cancelAnimationFrame(raf.current);
    setPhase("release");
    raf.current = null;
    setTimeout(() => {
      setP(0);
      setPhase("ready");
      setStep((s) => s + 1);
    }, 3500);
  };
  releaseRef.current = up;

  return (
    <div className={cn(card, "bg-gradient-to-b from-[#fff1ea] to-[#eef3ff]")}>
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold text-ink">Squeeze & release</div>
        <div className="text-[12px] text-ink-3">{done ? "Done" : `${step + 1} / ${MUSCLES.length}`}</div>
      </div>
      {done ? (
        <div className="py-8 text-center">
          <div className="text-[36px]">🫶</div>
          <div className="mt-2 text-[15px] font-semibold text-ink">Notice how loose you feel.</div>
          <button onClick={() => setStep(0)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] shadow-card">
            <RotateCcw className="h-3.5 w-3.5" /> Again
          </button>
        </div>
      ) : (
        <div className="pt-3 text-center">
          <div className="text-[17px] font-semibold text-ink">{m.part}</div>
          <div className="text-[13px] text-ink-3">{phase === "release" ? "Let go… feel the difference" : phase === "squeeze" ? `${m.how}… keep holding` : `${m.how} while you hold the button`}</div>
          <div className="relative mx-auto my-4 h-[150px] w-[150px]">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(11,27,58,0.08)" strokeWidth="6" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="#f08a5d" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${p * 276} 276`} />
            </svg>
            <motion.button
              onPointerDown={down}
              onPointerUp={up}
              onPointerLeave={up}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-[14px] select-none rounded-full text-[13px] font-semibold text-white"
              style={{ touchAction: "none", WebkitUserSelect: "none" }}
              animate={phase === "squeeze" ? { scale: 0.88, background: "#f08a5d" } : phase === "release" ? { scale: [0.88, 1.08, 1], background: "#6f8fea" } : { scale: 1, background: "#0b1b3a" }}
              transition={{ duration: phase === "release" ? 1.2 : 0.4 }}
            >
              <span className={phase === "squeeze" ? "text-[30px]" : "text-[15px]"}>{phase === "release" ? "Release" : phase === "squeeze" ? `${Math.max(1, Math.ceil(5 - p * 5))}` : "Hold"}</span>
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Stillness timer */

function chime(ctx: AudioContext) {
  [528, 792].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15 / (i + 1), ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 3);
  });
}

export function StillnessCard() {
  const [left, setLeft] = useState(60);
  const [running, setRunning] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const motes = useMemo(() => Array.from({ length: 14 }, () => ({ x: Math.random() * 100, d: 8 + Math.random() * 8, s: 3 + Math.random() * 4 })), []);
  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      setRunning(false);
      if (ctx.current) chime(ctx.current);
      return;
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [running, left]);
  const begin = () => {
    ctx.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.current.resume();
    if (left <= 0) setLeft(60);
    setRunning((r) => !r);
  };
  const done = left <= 0;
  return (
    <div className={cn(card, "relative bg-gradient-to-b from-[#f3efe6] to-[#e7efe9]")}>
      {running
        ? motes.map((m, i) => (
            <motion.span key={i} className="absolute bottom-0 rounded-full bg-[#9fb8a5]/50" style={{ left: `${m.x}%`, width: m.s, height: m.s }} animate={{ y: [-10, -240], opacity: [0, 0.8, 0] }} transition={{ duration: m.d, repeat: Infinity, delay: i * 0.6 }} />
          ))
        : null}
      <div className="relative text-[13.5px] font-semibold text-ink">One minute of stillness</div>
      <div className="relative mx-auto my-4 h-[160px] w-[160px]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(11,27,58,0.07)" strokeWidth="4" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="#5e8c6a" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${((60 - left) / 60) * 276} 276`} style={{ transition: "stroke-dasharray 1s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {done ? <div className="text-[15px] font-semibold text-ink">Welcome back</div> : <div className="tabular text-[34px] font-semibold text-ink">{left}</div>}
          <div className="text-[11.5px] text-ink-3">{done ? "" : running ? "just be here" : "seconds"}</div>
        </div>
      </div>
      <p className="relative text-center text-[12.5px] text-ink-3">{running ? "Nothing to do. Let thoughts come and go like clouds." : "Sit comfortably. A soft chime will tell you when it's over."}</p>
      <div className="relative mt-3 flex justify-center">
        <button onClick={begin} className="flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-[13px] font-medium text-white">
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Pause" : done ? "Again" : left < 60 ? "Resume" : "Begin"}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Counting sheep */

export function SheepCard() {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);
  const [jumping, setJumping] = useState(0);
  const stars = useMemo(() => Array.from({ length: 16 }, () => ({ x: Math.random() * 100, y: Math.random() * 45, s: 1 + Math.random() * 1.6 })), []);
  useEffect(() => {
    const t = setInterval(() => setJumping((j) => j + 1), reduce ? 6000 : 4000);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <div className={cn(card, "relative bg-gradient-to-b from-[#0f1736] via-[#1e2a5e] to-[#2e4a6b] p-0 text-white")}>
      {stars.map((s, i) => (
        <motion.span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 3 + (i % 3), repeat: Infinity, delay: i * 0.2 }} />
      ))}
      <div className="relative flex items-center justify-between px-4 pt-4">
        <div className="text-[13.5px] font-semibold">Counting sheep</div>
        <div className="tabular text-[12px] text-white/70">{count} counted</div>
      </div>
      <div className="relative h-[170px]">
        <div className="absolute right-6 top-5 text-[26px]">🌙</div>
        <div className="absolute inset-x-0 bottom-0 h-12 rounded-t-[50%] bg-[#2f5d46]" />
        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-1.5 rounded-sm bg-[#c9a57a]" />
          ))}
          <div className="absolute left-[-4px] right-[-4px] top-2 h-1.5 rounded-sm bg-[#c9a57a]" />
          <div className="absolute left-[-4px] right-[-4px] top-5 h-1.5 rounded-sm bg-[#c9a57a]" />
        </div>
        <AnimatePresence>
          <motion.div
            key={jumping}
            className="absolute bottom-9 text-[34px]"
            initial={{ left: "-12%", y: 0 }}
            animate={{ left: ["-12%", "38%", "62%", "112%"], y: [0, -58, -58, 0] }}
            transition={{ duration: reduce ? 5 : 3.6, times: [0, 0.4, 0.6, 1], ease: "easeInOut" }}
            onAnimationComplete={() => setCount((c) => c + 1)}
            style={{ scaleX: -1 }}
          >
            🐑
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="relative px-4 pb-3 pt-1 text-center text-[12px] text-white/75">Breathe out slowly each time one jumps. Let your eyes get heavy.</p>
    </div>
  );
}

/* ------------------------------------------------------------ Gratitude jar */

export function GratitudeCard() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<{ id: number; text: string; x: number }[]>([]);
  const [flying, setFlying] = useState<{ id: number; text: string } | null>(null);
  const id = useRef(0);
  const add = () => {
    const t = text.trim();
    if (!t || flying) return;
    const n = { id: id.current++, text: t };
    setFlying(n);
    setText("");
    setTimeout(() => {
      setItems((xs) => [...xs, { ...n, x: 18 + Math.random() * 54 }]);
      setFlying(null);
    }, 1100);
  };
  const full = items.length >= 3;
  return (
    <div className={cn(card, "bg-gradient-to-b from-[#fff6dc] to-[#ffeef0]")}>
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold text-ink">Gratitude jar</div>
        <div className="text-[12px] text-ink-3">{Math.min(items.length, 3)} / 3</div>
      </div>
      <div className="mt-0.5 text-[12.5px] text-ink-3">{full ? "Three good things. Hold onto them." : "Add three good things from today – big or tiny."}</div>
      <div className="relative mx-auto mt-3 h-[150px] w-[130px]">
        <AnimatePresence>
          {flying ? (
            <motion.div key={flying.id} className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1 text-[12px] text-ink-2 shadow-card" initial={{ top: -30, opacity: 0, scale: 1 }} animate={{ top: [-30, -40, 70], opacity: [0, 1, 0], scale: [1, 1, 0.3] }} transition={{ duration: 1.1, ease: "easeIn" }}>
              ✨ {flying.text}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="absolute left-1/2 top-0 h-3 w-[70px] -translate-x-1/2 rounded-md bg-[#c9a57a]" />
        <div className="absolute inset-x-0 bottom-0 top-3 rounded-b-[34px] rounded-t-[18px] border-[3px] border-white/90 bg-white/40 shadow-inner">
          {items.map((it, i) => (
            <motion.span key={it.id} className="absolute text-[20px]" style={{ left: `${it.x}%`, bottom: 8 + i * 22 }} initial={{ scale: 0 }} animate={{ scale: 1, opacity: [0.7, 1, 0.7] }} transition={{ opacity: { duration: 2.4, repeat: Infinity }, scale: { type: "spring", stiffness: 300, damping: 12 } }} title={it.text}>
              🌟
            </motion.span>
          ))}
        </div>
      </div>
      {items.length ? <div className="mt-2 flex flex-wrap justify-center gap-1">{items.map((i) => <span key={i.id} className="rounded-full bg-white/80 px-2 py-0.5 text-[11.5px] text-ink-2">{i.text}</span>)}</div> : null}
      <div className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="e.g. a good coffee" maxLength={60} className="h-10 min-w-0 flex-1 rounded-full border border-white bg-white/90 px-4 text-[16px] text-ink placeholder:text-ink-4 focus:outline-none" />
        <button onClick={add} disabled={!text.trim()} className="shrink-0 whitespace-nowrap rounded-full bg-ink px-4 text-[13px] font-medium text-white disabled:opacity-40">
          Add
        </button>
      </div>
      <div className="mt-1.5 text-center text-[10.5px] text-ink-4">Stays on this screen only – not saved.</div>
    </div>
  );
}

/* ------------------------------------------------------------- Affirmations */

const AFFIRMATIONS = [
  "You don't have to get everything done today.",
  "This feeling is real, and it will pass.",
  "You're allowed to rest.",
  "Small steps still count.",
  "You've handled hard days before.",
  "It's okay to ask for help.",
  "Breathe. You're here, right now.",
  "Be as kind to yourself as you'd be to a friend.",
  "Progress, not perfection.",
  "You are more than a busy day.",
];
const AFF_BG = ["from-[#cfe3ff] to-[#e9dcff]", "from-[#d7f5ea] to-[#d9ecff]", "from-[#ffe3d6] to-[#ffd9ec]", "from-[#e6e0ff] to-[#d4f0ff]"];

export function AffirmationCard() {
  const [i, setI] = useState(() => Math.floor(Math.random() * AFFIRMATIONS.length));
  const [n, setN] = useState(0);
  return (
    <div className={cn(card, "bg-gradient-to-br transition-colors duration-700", AFF_BG[n % AFF_BG.length])}>
      <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-ink-3">A gentle reminder</div>
      <div className="relative flex h-[130px] items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p key={i} className="px-2 text-center text-[19px] font-semibold leading-snug text-ink" initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(4px)" }} transition={{ duration: 0.6 }}>
            {AFFIRMATIONS[i]}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="flex justify-center">
        <button onClick={() => { setI((x) => (x + 1 + Math.floor(Math.random() * (AFFIRMATIONS.length - 1))) % AFFIRMATIONS.length); setN((x) => x + 1); }} className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-[13px] font-medium text-ink shadow-card">
          <Sparkles className="h-3.5 w-3.5" /> Another one
        </button>
      </div>
    </div>
  );
}
