import type { ReactNode } from "react";

import { AppIcons, type AppIconKey } from "@/lib/design-system/icons";
import { statusSurfaceClass, statusHintClass, statusTitleClass, type StatusTone } from "@/lib/design-system/status-styles";

export type EmptyStateProps = {
  icon?: AppIconKey;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: StatusTone;
  /** Softer surface when nested inside another card or panel. */
  inset?: boolean;
  className?: string;
  "data-testid"?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  inset = false,
  className = "",
  "data-testid": dataTestId,
}: EmptyStateProps) {
  const Icon = icon ? AppIcons[icon] : null;
  const isTinted = tone === "ready" || tone === "success" || tone === "blocked" || tone === "warning" || tone === "in_progress";
  const surfaceClass = inset
    ? `rounded-lg border p-4 shadow-none ${statusSurfaceClass(tone)}`
    : `rounded-xl border p-5 ${statusSurfaceClass(tone)}`;

  return (
    <div className={`${surfaceClass} ${className}`.trim()} data-testid={dataTestId}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 ${
              isTinted ? "border-current/10 bg-white/70" : ""
            }`}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${statusTitleClass(tone)}`}>{title}</p>
          {description ? <p className={`mt-2 text-sm ${statusHintClass(tone)}`}>{description}</p> : null}
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
