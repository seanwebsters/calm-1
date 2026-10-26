import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 shadow-card",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-muted shadow-card",
  ghost: "text-ink-2 hover:bg-surface-sunken hover:text-ink",
  subtle: "bg-calm-50 text-calm-700 hover:bg-calm-100",
  danger: "bg-surface text-bad border border-line hover:border-bad/40 hover:bg-bad-soft",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-[13.5px] gap-2 rounded-[10px]",
  icon: "h-8 w-8 rounded-lg justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn("inline-flex select-none items-center font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
});
