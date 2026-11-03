/** Category artwork for Calm content cards (test placeholders). */
export const ART: Record<string, { bg: string; emoji: string }> = {
  sleep: { bg: "linear-gradient(160deg,#1c2a5a 0%,#3b3f8f 55%,#6a5fdc 100%)", emoji: "🌙" },
  stories: { bg: "linear-gradient(160deg,#23304f 0%,#5a4b8c 60%,#a07cc5 100%)", emoji: "📖" },
  meditation: { bg: "linear-gradient(160deg,#1f6f78 0%,#3e9a9a 55%,#8fd3c6 100%)", emoji: "🍃" },
  breathing: { bg: "linear-gradient(160deg,#3a6fd8 0%,#6f8fea 55%,#a9c7f7 100%)", emoji: "🫧" },
  music: { bg: "linear-gradient(160deg,#284b63 0%,#3c6e71 55%,#d9a05b 100%)", emoji: "🌊" },
  focus: { bg: "linear-gradient(160deg,#2b2d42 0%,#5c5f8a 55%,#a3a7d6 100%)", emoji: "🎹" },
  movement: { bg: "linear-gradient(160deg,#7a3e65 0%,#c06c84 55%,#f8b195 100%)", emoji: "🧘" },
};

export function artFor(category: string) {
  return ART[category] ?? ART.meditation!;
}

