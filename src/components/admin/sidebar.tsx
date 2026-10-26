"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, BarChart3, Bell, Brain, ChevronsUpDown, LayoutGrid, Library, LogOut, MessagesSquare, Settings, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/users", label: "Users", icon: Users },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/content", label: "Content", icon: Library },
  { href: "/checkins", label: "Check-ins", icon: Bell },
  { href: "/personality", label: "Personality", icon: SlidersHorizontal },
  { href: "/safety", label: "Safety", icon: ShieldCheck },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ admin, environment }: { admin: { name: string; email: string; roleLabel: string }; environment: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const initials = admin.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-5 pb-6 pt-6">
        <Wordmark />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 scroll-thin" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn("group relative flex items-center gap-3 rounded-[10px] px-3 py-[7px] text-[13.5px] font-medium transition-colors", active ? "text-ink" : "text-ink-3 hover:bg-surface-sunken hover:text-ink")}
            >
              {active ? <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[10px] bg-calm-50" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
              <Icon className={cn("relative h-[17px] w-[17px]", active ? "text-calm-600" : "text-ink-4 group-hover:text-ink-3")} strokeWidth={1.75} />
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </nav>
      {environment !== "production" ? (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-[11.5px] text-ink-3">
          <Activity className="h-3.5 w-3.5" />
          {environment === "development" ? "Development environment" : `Environment: ${environment}`}
        </div>
      ) : null}
      <div ref={ref} className="relative border-t border-line p-3">
        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-[68px] left-3 right-3 rounded-xl border border-line bg-surface p-1 shadow-pop"
            >
              <div className="px-3 py-2 text-[12px] text-ink-3">{admin.email}</div>
              <Link href="/settings?tab=team" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-ink-2 hover:bg-surface-sunken">
                <Users className="h-4 w-4" /> Team & access
              </Link>
              <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-ink-2 hover:bg-surface-sunken">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-surface-sunken" aria-haspopup="menu" aria-expanded={open}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-calm-200 to-calm-100 text-[12px] font-semibold text-calm-700">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{admin.name}</span>
            <span className="block truncate text-[11.5px] text-ink-4">{admin.roleLabel}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-ink-4" />
        </button>
      </div>
    </aside>
  );
}
