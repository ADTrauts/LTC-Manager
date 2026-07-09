import type { ReactNode } from "react";

import { AppIcons, type AppIconKey } from "@/lib/design-system/icons";
import {
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

  return (
    <div className={`rounded-xl border p-4 ${statusSurfaceClass(tone)} ${className}`.trim()}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wider ${statusLabelClass(tone)}`}>{label}</p>
        {Icon ? <Icon className={`h-4 w-4 shrink-0 ${statusLabelClass(tone)}`} aria-hidden /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <p className={`text-3xl font-semibold ${statusValueClass(tone)}`}>{value}</p>
        {trend ? <div className="pb-0.5 text-sm text-zinc-600">{trend}</div> : null}
      </div>
      {hint ? <p className={`mt-1 text-xs ${statusHintClass(tone)}`}>{hint}</p> : null}
    </div>
  );
}
