import type { Channel } from "../db/types";

export type Source = "production" | "simulator" | "demo";

export function parseFilters(sp: Record<string, string | string[] | undefined>, defaults: { range?: number } = {}) {
  const rangeRaw = Number(sp.range ?? defaults.range ?? 14);
  const range = [7, 14, 30, 90].includes(rangeRaw) ? rangeRaw : 14;
  const source: Source = sp.source === "simulator" || sp.source === "demo" ? sp.source : "production";
  const channels: Channel[] = source === "production" ? ["whatsapp"] : [source];
  return { range, source, channels };
}

export const SOURCE_LABEL: Record<Source, string> = { production: "WhatsApp (production)", simulator: "Simulator", demo: "Demo data" };
