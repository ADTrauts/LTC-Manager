/**
 * Wave 16A — Widget renderer (declarative; no Experience logic).
 */

import {
  resolveComponentRenderer,
  type ExperienceShellWidget,
} from "@/lib/experience-shell";

import { UnknownComponentPlaceholder } from "./placeholders";

export function WidgetRenderer({
  widget,
}: {
  widget: ExperienceShellWidget;
}) {
  const renderer = resolveComponentRenderer(`widget:${widget.kind}`);
  if (renderer === "UnknownPlaceholder") {
    return <UnknownComponentPlaceholder kind={`widget:${widget.kind}`} />;
  }

  return (
    <div
      className="rounded-md border border-zinc-100 bg-white px-2.5 py-2 text-xs text-zinc-700"
      data-testid="experience-widget"
      data-widget-key={widget.key}
      data-widget-kind={widget.kind}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-zinc-800">
          {widget.kind.replace(/_/g, " ")}
        </span>
        <span className="font-mono text-[10px] text-zinc-400">{widget.key}</span>
      </div>
      {widget.overlayError ? (
        <p className="mt-1 text-amber-800">{widget.overlayError}</p>
      ) : widget.overlayValue != null ? (
        <p className="mt-1 text-zinc-600">
          {typeof widget.overlayValue === "string" ||
          typeof widget.overlayValue === "number" ||
          typeof widget.overlayValue === "boolean"
            ? String(widget.overlayValue)
            : "Overlay bound"}
        </p>
      ) : (
        <p className="mt-1 text-zinc-500">
          Awaiting runtime overlay
          {widget.overlayKey ? ` (${widget.overlayKey})` : ""}.
        </p>
      )}
    </div>
  );
}
