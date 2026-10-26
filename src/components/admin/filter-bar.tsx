"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";

export function FilterBar({ range, source, showRange = true, ranges = [7, 14, 30, 90] }: { range: number; source: string; showRange?: boolean; ranges?: number[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set(k, v);
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        value={source}
        onChange={(v) => set("source", v)}
        options={[
          { value: "production", label: "WhatsApp" },
          { value: "simulator", label: "Simulator" },
          { value: "demo", label: "Demo" },
        ]}
      />
      {showRange ? <Segmented value={String(range)} onChange={(v) => set("range", v)} options={ranges.map((r) => ({ value: String(r), label: `${r}d` }))} /> : null}
    </div>
  );
}
