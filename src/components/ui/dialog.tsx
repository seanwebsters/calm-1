"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function Dialog({ open, onClose, title, description, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative w-full rounded-2xl border border-line bg-surface shadow-pop"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div>
                <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
                {description ? <p className="mt-1 text-[13px] text-ink-3">{description}</p> : null}
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-ink-4 hover:bg-surface-sunken hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children ? <div className="px-5 py-4">{children}</div> : null}
            {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
