import {
  OperationalListRow,
  StatusBadge,
} from "@/components/design-system";
import type { ExceptionFirstLocationCardView } from "@/lib/locations/exception-first";

export function ExceptionFirstLocationCard({
  card,
}: {
  card: ExceptionFirstLocationCardView;
}) {
  const happeningLine = [card.happeningLabel, card.cycleLabel]
    .filter((line): line is string => Boolean(line) && line !== card.badge.label)
    .join(" · ");

  const details = (
    <div className="mt-1.5 space-y-0.5 text-sm">
      {card.wrongLabels.length > 0 ? (
        <p className="font-medium text-zinc-900">
          {card.wrongLabels.join(" · ")}
          {card.moreWrongCount > 0 ? ` · +${card.moreWrongCount} more` : ""}
        </p>
      ) : null}
      {happeningLine ? <p className="text-zinc-700">{happeningLine}</p> : null}
      {card.responsibleLabel ? (
        <p className="text-zinc-600">{card.responsibleLabel}</p>
      ) : null}
      {card.evidenceLabel ? (
        <p className="text-zinc-600">{card.evidenceLabel}</p>
      ) : null}
      {card.nextLabel ? <p className="text-zinc-600">{card.nextLabel}</p> : null}
    </div>
  );

  return (
    <OperationalListRow
      testId="exception-first-location-card"
      emphasized={card.emphasized}
      href={card.href ?? undefined}
      title={card.name}
      description={card.place ?? undefined}
      meta={
        <StatusBadge variant={card.badge.variant} prominence={card.badge.prominence}>
          {card.badge.label}
        </StatusBadge>
      }
      details={details}
    />
  );
}
