"use client";
import { Play } from "lucide-react";
import { artFor } from "./art";

export interface ContentItem {
  title: string;
  description: string;
  category: string;
  minutes: number | null;
  url: string;
}

export function ContentCards({ items }: { items: ContentItem[] }) {
  return (
    <div className="mt-1.5 flex w-full max-w-[320px] flex-col gap-1.5">
      {items.map((i) => {
        const art = artFor(i.category);
        const [kind, ...rest] = i.description.split(" · ");
        return (
          <a key={i.url} href={i.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 overflow-hidden rounded-xl bg-white p-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] active:opacity-80">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-[24px]" style={{ background: art.bg }}>
              {art.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-[#111b21]">{i.title}</div>
              <div className="truncate text-[12px] text-[#667781]">
                {rest.length ? kind : i.category}
                {i.minutes ? ` · ${i.minutes} min` : ""} · Calm
              </div>
            </div>
            <div className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
              <Play className="ml-0.5 h-4 w-4" />
            </div>
          </a>
        );
      })}
      <div className="px-1 text-[10.5px] text-[#667781]">Test links: these open placeholder pages.</div>
    </div>
  );
}
