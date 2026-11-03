/* eslint-disable @next/next/no-img-element */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <img src="/brand/calm-icon.png" alt="Calm" width={size} height={size} style={{ width: size, height: size, borderRadius: size * 0.22 }} className="shrink-0" />;
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-display text-ink">Calm-1</div>
        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">Admin</div>
      </div>
    </div>
  );
}
