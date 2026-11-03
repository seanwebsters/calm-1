"use client";
/**
 * Animated breathing exercise shown in the web chat when Calm-1 runs the
 * breathing_exercise tool. Timings match the vetted scripts in
 * lib/tools/exercises.ts. WhatsApp gets the same steps as text.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";

type Phase = { label: "Breathe in" | "Hold" | "Breathe out" | "Top up"; secs: number; scale?: number };

export const PATTERNS: Record<string, { name: string; phases: Phase[]; rounds: number }> = {
  box: {
    name: "Box breathing",
    rounds: 4,
    phases: [
      { label: "Breathe in", secs: 4 },
      { label: "Hold", secs: 4 },
      { label: "Breathe out", secs: 4 },
      { label: "Hold", secs: 4 },
    ],
  },
  slow: {
    name: "Slow breathing",
    rounds: 6,
    phases: [
      { label: "Breathe in", secs: 4 },
      { label: "Breathe out", secs: 6 },
    ],
  },
  sigh: {
    name: "Calming sigh",
    rounds: 5,
    phases: [
      { label: "Breathe in", secs: 2, scale: 0.88 },
      { label: "Top up", secs: 1, scale: 1 },
      { label: "Breathe out", secs: 6 },
    ],
  },
  even: {
    name: "Even breathing",
    rounds: 6,
    phases: [
      { label: "Breathe in", secs: 5 },
      { label: "Breathe out", secs: 5 },
    ],
  },
  wind_down: {
    name: "Wind-down breathing",
    rounds: 4,
    phases: [
      { label: "Breathe in", secs: 4 },
      { label: "Hold", secs: 7 },
      { label: "Breathe out", secs: 8 },
    ],
  },
};

const SMALL = 0.55;

export function BreathingCard({ style }: { style: string }) {
  const pattern = PATTERNS[style] ?? PATTERNS.slow!;
  const reduce = useReducedMotion();
  const initial = { running: false, done: false, round: 1, phaseIdx: 0, left: pattern.phases[0]!.secs };
  const [st, setSt] = useState(initial);
  const { running, done, round, phaseIdx, left } = st;
  const setRunning = (f: (r: boolean) => boolean) => setSt((x) => ({ ...x, running: f(x.running) }));
  const scaleRef = useRef(SMALL);

  const phase = pattern.phases[phaseIdx]!;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSt((x) => {
        if (x.left > 1) return { ...x, left: x.left - 1 };
        const next = (x.phaseIdx + 1) % pattern.phases.length;
        if (next === 0 && x.round >= pattern.rounds) return { ...x, running: false, done: true };
        return { ...x, phaseIdx: next, round: next === 0 ? x.round + 1 : x.round, left: pattern.phases[next]!.secs };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, pattern]);

  // Bubble size follows the breath: grow on the in-breath, stay on holds, shrink on the out-breath.
  const target = !running && !done ? SMALL : phase.scale ?? (phase.label === "Breathe in" ? 1 : phase.label === "Breathe out" ? SMALL : scaleRef.current);
  scaleRef.current = target;
  const duration = running && phase.label !== "Hold" ? phase.secs : 0.6;

  const reset = () => {
    setSt(initial);
    scaleRef.current = SMALL;
  };

  return (
    <div className="mt-2 w-full max-w-[320px] overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-[#eaf2fd] to-[#efeafd] p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold text-ink">{pattern.name}</div>
        <div className="text-[12px] text-ink-3">
          {done ? "Done" : `Round ${round} of ${pattern.rounds}`}
        </div>
      </div>

      <div className="relative mx-auto my-3 flex h-[210px] w-[210px] items-center justify-center" aria-live="polite">
        {/* soft rings */}
        {!reduce
          ? [0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute rounded-full border border-white/70"
                style={{ width: 210, height: 210 }}
                animate={running ? { scale: [0.6, 1.05], opacity: [0.5, 0] } : { scale: 0.6, opacity: 0 }}
                transition={{ duration: 4, repeat: running ? Infinity : 0, delay: i * 1.3, ease: "easeOut" }}
              />
            ))
          : null}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 190, height: 190, background: "radial-gradient(circle at 35% 30%, #a9c7f7 0%, #6f8fea 45%, #6a5fdc 100%)", boxShadow: "0 18px 40px -12px rgba(90,95,220,0.55)" }}
          animate={{ scale: reduce ? 0.8 : target }}
          transition={{ duration, ease: "easeInOut" }}
        />
        <div className="relative text-center text-white">
          {done ? (
            <div className="text-[17px] font-semibold drop-shadow-sm">Nicely done</div>
          ) : running ? (
            <>
              <div className="text-[17px] font-semibold drop-shadow-sm">{phase.label}</div>
              <div className="tabular text-[34px] font-semibold leading-none drop-shadow-sm">{left}</div>
            </>
          ) : (
            <div className="text-[15px] font-semibold leading-tight drop-shadow-sm">Tap start<br />when ready</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        {done ? (
          <button onClick={reset} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-ink shadow-card">
            <RotateCcw className="h-3.5 w-3.5" /> Again
          </button>
        ) : (
          <>
            <button onClick={() => setRunning((r) => !r)} className="flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-[13px] font-medium text-white">
              {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {running ? "Pause" : round === 1 && phaseIdx === 0 && left === pattern.phases[0]!.secs ? "Start" : "Resume"}
            </button>
            {round > 1 || phaseIdx > 0 ? (
              <button onClick={reset} className="rounded-full bg-white px-3 py-2 text-[13px] text-ink-2 shadow-card" aria-label="Restart">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-ink-4">
        {pattern.phases.map((p) => `${p.label === "Breathe in" ? "In" : p.label === "Breathe out" ? "Out" : p.label === "Top up" ? "Top up" : "Hold"} ${p.secs}`).join(" · ")} — go gently, stop if you feel light-headed.
      </p>
    </div>
  );
}
