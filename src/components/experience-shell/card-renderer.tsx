/**
 * Wave 16A — Card renderer (generic containers from descriptors).
 */

import {
  resolveComponentRenderer,
  type ExperienceShellCard,
} from "@/lib/experience-shell";

import { UnknownComponentPlaceholder } from "./placeholders";
import { ToolHost } from "./tool-host";
import { WidgetRenderer } from "./widget-renderer";

export function CardRenderer({ card }: { card: ExperienceShellCard }) {
  const renderer = resolveComponentRenderer(`card:${card.kind}`);
  if (renderer === "UnknownPlaceholder") {
    return <UnknownComponentPlaceholder kind={`card:${card.kind}`} />;
  }

  return (
    <article
      className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm"
      data-testid="experience-card"
      data-card-key={card.key}
      data-card-kind={card.kind}
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h5 className="text-sm font-semibold text-zinc-900">{card.title}</h5>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {card.kind.replace(/_/g, " ")}
          </span>
        </div>
        {card.description ? (
          <p className="text-xs text-zinc-600">{card.description}</p>
        ) : null}
      </header>

      {card.actions.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {card.actions.map((action) => (
            <li key={action.key}>
              <span
                className="inline-flex min-h-8 items-center rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-800"
                data-action-key={action.key}
              >
                {action.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {card.widgets.length > 0 ? (
        <div className="mt-2 space-y-2">
          {card.widgets.map((widget) => (
            <WidgetRenderer key={widget.key} widget={widget} />
          ))}
        </div>
      ) : null}

      {card.toolHost ? (
        <div className="mt-2">
          <ToolHost tool={card.toolHost} />
        </div>
      ) : null}

      {card.widgets.length === 0 && !card.toolHost ? (
        <p className="mt-2 text-xs text-zinc-500">No widgets bound yet.</p>
      ) : null}
    </article>
  );
}
