import type { ReactNode } from "react";

import { AppIcons, type AppIconKey } from "@/lib/design-system/icons";
import {
  isQuietZeroMetricValue,
  metricQuietZeroClasses,
  statusHintClass,
  statusLabelClass,
  statusSurfaceClass,
  statusValueClass,
  type StatusTone,
} from "@/lib/design-system/status-styles";

export type MetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  trend?: ReactNode;
  icon?: AppIconKey;
  tone?: StatusTone;
  className?: string;
};

/**
 * Compact metric tile. Zero counts on exception tones mute color so empty
 * "Needs Attention 0" does not compete with real exceptions (quiet by default).
 */
export function MetricCard({
  label,
  value,
  hint,
  trend,
  icon,
  tone = "default",
  className = "",
}: MetricCardProps) {
  const Icon = icon ? AppIcons[icon] : null;
  const quiet =
    isQuietZeroMetricValue(value) ? metricQuietZeroClasses(tone) : null;
  const surface = quiet?.surface ?? statusSurfaceClass(tone);
  const labelClass = quiet?.label ?? statusLabelClass(tone);
  const valueClass = quiet?.value ?? statusValueClass(tone);
  const hintClass = quiet?.hint ?? statusHintClass(tone);

  return (
    <div
      className={`rounded-lg border p-4 ${surface} ${className}`.trim()}
      data-metric-quiet-zero={quiet ? "true" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wider ${labelClass}`}>{label}</p>
        {Icon ? <Icon className={`h-4 w-4 shrink-0 ${labelClass}`} aria-hidden /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <p className={`text-2xl font-semibold tabular-nums sm:text-3xl ${valueClass}`}>{value}</p>
        {trend ? <div className="pb-0.5 text-sm text-zinc-600">{trend}</div> : null}
      </div>
      {hint ? <p className={`mt-1 text-xs ${hintClass}`}>{hint}</p> : null}
    </div>
  );
}
