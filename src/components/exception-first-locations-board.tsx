import Link from "next/link";
import type { ReactNode } from "react";

import { ExceptionFirstLocationCard } from "@/components/exception-first-location-card";
import {
  EmptyState,
  operationalListShellClass,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import type { ExceptionFirstLocationBoardView } from "@/lib/locations/exception-first";

export function ExceptionFirstLocationsBoard({
  board,
  projectionError,
  canConfigureFacility,
  lensSummary,
  departmentLabel,
}: {
  board: ExceptionFirstLocationBoardView;
  projectionError: string | null;
  canConfigureFacility: boolean;
  lensSummary: string | null;
  departmentLabel: string | null;
}) {
  const configureLink = canConfigureFacility ? (
    <Link
      href="/admin/facility/builder"
      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
    >
      Configure facility structure
    </Link>
  ) : null;
  const manageLink = canConfigureFacility ? (
    <Link
      href="/admin/facility/builder"
      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
    >
      Manage locations in Facility Builder
    </Link>
  ) : null;

  let body: ReactNode;

  if (projectionError) {
    body = (
      <EmptyState
        icon="locations"
        title="Locations are temporarily unavailable."
        description="Operational location eligibility could not be resolved. Try again shortly."
        tone="warning"
        data-testid="locations-unavailable"
      />
    );
  } else if (board.spaceCount === 0) {
    body = (
      <EmptyState
        icon="locations"
        title="No locations assigned"
        description={
          departmentLabel
            ? `${departmentLabel} does not currently have any locations assigned in Facility Builder.`
            : "No locations are assigned for this mode in Facility Builder."
        }
        action={manageLink}
        data-testid="locations-empty"
      />
    );
  } else {
    body = (
      <ul
        className={`${operationalListShellClass} divide-y divide-zinc-200`}
        data-testid="exception-first-locations"
      >
        {board.cards.map((card) => (
          <ExceptionFirstLocationCard key={card.spaceId} card={card} />
        ))}
      </ul>
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        icon="locations"
        title="Locations"
        subtitle="What needs attention now. Open a card for the full location."
        status={
          <>
            {lensSummary ? <StatusBadge variant="neutral">{lensSummary}</StatusBadge> : null}
            {board.attentionCount > 0 ? (
              <StatusBadge variant="warning">
                {board.attentionCount === 1
                  ? "1 needs attention"
                  : `${board.attentionCount} need attention`}
              </StatusBadge>
            ) : null}
          </>
        }
        actions={configureLink}
      />
      {body}
    </section>
  );
}
