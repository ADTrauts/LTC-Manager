/**
 * Canonical readiness and operational status surfaces — shared by StatusBadge, MetricCard, EmptyState.
 *
 * Quiet-by-default: healthy / on-track / ready should not dominate attention.
 * Loud-by-exception: blocked / warning / in_progress remain strong.
 *
 * Build blue chrome (mode) is separate — amber remains reserved for warning/progress states.
 */

export type StatusTone =
  | "ready"
  | "in_progress"
  | "blocked"
  | "warning"
  | "success"
  | "neutral"
  | "default";

export type StatusBadgeVariant = Exclude<StatusTone, "default">;

/** Prominence for healthy states — sidebar Ready uses quiet. */
export type StatusProminence = "default" | "quiet";

const BADGE_CLASSES: Record<StatusBadgeVariant, string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-900",
  in_progress: "border-amber-200 bg-amber-50 text-amber-900",
  blocked: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

/** Quiet healthy badge — still labeled, not color-only; low visual weight. */
const QUIET_READY_BADGE_CLASS =
  "border-transparent bg-transparent font-medium text-zinc-500";

const SURFACE_CLASSES: Record<StatusTone, string> = {
  ready: "border-emerald-200 bg-emerald-50",
  success: "border-emerald-200 bg-emerald-50",
  in_progress: "border-amber-200 bg-amber-50",
  warning: "border-amber-200 bg-amber-50",
  blocked: "border-red-200 bg-red-50",
  neutral: "border-zinc-200 bg-zinc-50",
  default: "border-zinc-200 bg-white",
};

/** Zero-count metric surfaces — keep label/value, drop status color blocks. */
const QUIET_ZERO_SURFACE = "border-zinc-200 bg-white";
const QUIET_ZERO_LABEL = "text-zinc-500";
const QUIET_ZERO_VALUE = "text-zinc-400";
const QUIET_ZERO_HINT = "text-zinc-500";

const LABEL_CLASSES: Record<StatusTone, string> = {
  ready: "text-emerald-800",
  success: "text-emerald-800",
  in_progress: "text-amber-800",
  warning: "text-amber-800",
  blocked: "text-red-700",
  neutral: "text-zinc-600",
  default: "text-zinc-500",
};

const VALUE_CLASSES: Record<StatusTone, string> = {
  ready: "text-emerald-950",
  success: "text-emerald-950",
  in_progress: "text-amber-950",
  warning: "text-amber-950",
  blocked: "text-red-900",
  neutral: "text-zinc-900",
  default: "text-zinc-900",
};

const HINT_CLASSES: Record<StatusTone, string> = {
  ready: "text-emerald-900",
  success: "text-emerald-800",
  in_progress: "text-amber-900",
  warning: "text-amber-900",
  blocked: "text-red-800",
  neutral: "text-zinc-600",
  default: "text-zinc-600",
};

const TITLE_CLASSES: Record<StatusTone, string> = {
  ready: "text-emerald-900",
  success: "text-emerald-900",
  in_progress: "text-amber-950",
  warning: "text-amber-950",
  blocked: "text-red-900",
  neutral: "text-zinc-900",
  default: "text-zinc-900",
};

const BADGE_LABELS: Record<StatusBadgeVariant, string> = {
  ready: "Ready",
  in_progress: "In Progress",
  blocked: "Needs Attention",
  warning: "Warning",
  success: "Success",
  neutral: "Neutral",
};

export function statusBadgeClass(
  variant: StatusBadgeVariant,
  prominence: StatusProminence = "default",
): string {
  if (prominence === "quiet" && (variant === "ready" || variant === "success")) {
    return QUIET_READY_BADGE_CLASS;
  }
  return BADGE_CLASSES[variant];
}

export function statusBadgeLabel(variant: StatusBadgeVariant): string {
  return BADGE_LABELS[variant];
}

export function statusSurfaceClass(tone: StatusTone): string {
  return SURFACE_CLASSES[tone];
}

export function statusLabelClass(tone: StatusTone): string {
  return LABEL_CLASSES[tone];
}

export function statusValueClass(tone: StatusTone): string {
  return VALUE_CLASSES[tone];
}

export function statusHintClass(tone: StatusTone): string {
  return HINT_CLASSES[tone];
}

export function statusTitleClass(tone: StatusTone): string {
  return TITLE_CLASSES[tone];
}

/** True when a metric value is a numeric zero (or string "0"). */
export function isQuietZeroMetricValue(value: string | number): boolean {
  if (typeof value === "number") return value === 0;
  const trimmed = value.trim();
  return trimmed === "0" || trimmed === "0%" || trimmed === "0.0";
}

/**
 * Exception tones that should mute when the count is zero (quiet by default).
 * On-track / success / ready zeros can stay lightly tinted or also mute — we mute all.
 */
export function metricQuietZeroClasses(tone: StatusTone): {
  surface: string;
  label: string;
  value: string;
  hint: string;
} | null {
  if (tone === "default" || tone === "neutral") return null;
  return {
    surface: QUIET_ZERO_SURFACE,
    label: QUIET_ZERO_LABEL,
    value: QUIET_ZERO_VALUE,
    hint: QUIET_ZERO_HINT,
  };
}
