"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBox({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [v, setV] = useState(sp.get(param) ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const p = new URLSearchParams(sp.toString());
        if (v.trim()) p.set(param, v.trim());
        else p.delete(param);
        router.push(`${path}?${p.toString()}`);
      }}
      className="relative w-64"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-8 pl-8 text-[13px]" />
    </form>
  );
}
