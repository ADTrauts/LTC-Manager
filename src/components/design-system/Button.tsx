import type { ButtonHTMLAttributes, ReactNode } from "react";

import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "accent";
export type ButtonSize = "compact" | "default";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When true, keeps layout stable and disables the control. */
  loading?: boolean;
  /** Leading icon (decorative unless icon-only). */
  icon?: ReactNode;
  /** Accessible name required when children are empty / icon-only. */
  "aria-label"?: string;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-zinc-900 text-white hover:bg-zinc-700 disabled:border-transparent disabled:bg-zinc-300 disabled:text-zinc-500",
  secondary:
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400",
  ghost:
    "border border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400",
  destructive:
    "border border-transparent bg-red-700 text-white hover:bg-red-800 disabled:bg-red-200 disabled:text-red-400",
  /** Facility brand / Build primary when accent CSS var is set. Prefer primary for most actions. */
  accent:
    "app-accent-button border border-transparent text-white disabled:opacity-50",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  compact: "min-h-9 gap-1.5 px-2.5 text-xs",
  default: "min-h-10 gap-2 px-3.5 text-sm",
};

/**
 * Canonical button primitive. Prove on a few surfaces before global rewrite.
 * Touch target: default ≥ 40px (min-h-10); compact ≥ 36px for dense toolbars.
 */
export function Button({
  variant = "primary",
  size = "default",
  loading = false,
  disabled,
  icon,
  children,
  className = "",
  type = "button",
  "aria-label": ariaLabel,
  ...rest
}: ButtonProps) {
  const iconOnly = Boolean(icon) && (children === undefined || children === null || children === "");
  if (iconOnly && !ariaLabel) {
    // Dev-time guard: icon-only buttons must name themselves.
    if (process.env.NODE_ENV !== "production") {
      console.warn("Button: icon-only usage requires aria-label");
    }
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      className={`inline-flex touch-manipulation items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed ${FOCUS_RING_CLASS} ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`.trim()}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-3.5 w-3.5 animate-pulse rounded-full bg-current opacity-60" aria-hidden />
      ) : icon ? (
        <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children ? <span className={loading ? "opacity-80" : undefined}>{children}</span> : null}
    </button>
  );
}
