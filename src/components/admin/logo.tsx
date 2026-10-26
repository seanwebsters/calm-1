export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="calm1-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5C8FEA" />
          <stop offset="1" stopColor="#1C4A9E" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#calm1-logo)" />
      <path d="M40 22.5a12 12 0 1 0 0 19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
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
