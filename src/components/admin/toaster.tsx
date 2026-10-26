"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, XCircle } from "lucide-react";

interface T {
  id: number;
  message: string;
  tone: "good" | "bad" | "neutral";
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ message: string; tone: T["tone"] }>).detail;
      const id = ++n;
      setItems((xs) => [...xs, { id, ...d }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
    };
    window.addEventListener("calm1-toast", on);
    return () => window.removeEventListener("calm1-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink shadow-pop"
          >
            {t.tone === "good" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-good" /> : t.tone === "bad" ? <XCircle className="mt-0.5 h-4 w-4 text-bad" /> : <Info className="mt-0.5 h-4 w-4 text-calm-500" />}
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
