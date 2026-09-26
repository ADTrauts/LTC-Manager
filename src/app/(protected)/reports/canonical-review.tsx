import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/design-system";
import {
  presenceExceptionLabel,
  type OperationalReviewDayPresentation,
  type PresentedCoverageRow,
  type PresentedEvidenceRow,
} from "@/lib/operational-review/present-operational-review-day";

import {
  ReviewCard,
  ReviewCell,
  ReviewCountList,
  ReviewMuted,
  ReviewStatus,
  ReviewTable,
  ReviewTableRow,
} from "./review-layout";
import { ReviewDateForm } from "./review-date-form";
import { ReviewModeNav } from "./review-mode-nav";

function evidenceStatusKind(state: PresentedEvidenceRow["state"]) {
  if (state === "not_complete") return "alert" as const;
  if (state === "completed_with_corrective_action") return "progress" as const;
  if (state === "unavailable") return "neutral" as const;
  return "ok" as const;
}

function coverageStatusKind(state: PresentedCoverageRow["state"]) {
  if (state === "uncovered") return "alert" as const;
  if (state === "at_risk") return "progress" as const;
  if (state === "unavailable") return "neutral" as const;
  return "ok" as const;
}

function UnavailableBanner({ message }: { message: string }) {
  return (
    <p className="mb-3 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
      <span className="font-semibold">Historical expectation unavailable. </span>
      {message}
    </p>
  );
}

function EvidenceTable({
  rows,
  caption,
}: {
  rows: PresentedEvidenceRow[];
  caption: string;
}) {
  return (
    <ReviewTable
      caption={caption}
      columns={["Location", "Requirement", "Window", "Status", "Occurred at", "Details"]}
    >
      {rows.map((row) => (
        <ReviewTableRow key={`${row.requirementKey}-${row.spaceId ?? "none"}`}>
          <ReviewCell>{row.locationLabel}</ReviewCell>
          <ReviewCell>{row.requirementLabel}</ReviewCell>
          <ReviewCell>{row.windowLabel ?? "—"}</ReviewCell>
          <ReviewCell>
            <ReviewStatus kind={evidenceStatusKind(row.state)}>{row.stateLabel}</ReviewStatus>
          </ReviewCell>
          <ReviewCell>{row.occurredAtLabel ?? "—"}</ReviewCell>
          <ReviewCell>
            {row.recordHref || row.recordedLater || row.recordedAtLabel ? (
              <details>
                <summary className="cursor-pointer text-zinc-700 hover:text-zinc-900">View</summary>
                <div className="mt-2 space-y-1 text-xs text-zinc-600">
                  {row.recordedAtLabel ? <p>Recorded at {row.recordedAtLabel}</p> : null}
                  {row.recordedLater ? <p>Recorded later</p> : null}
                  {row.recordHref ? (
                    <p>
                      <Link href={row.recordHref} className="underline underline-offset-2">
                        Open Log Book record
                      </Link>
                    </p>
                  ) : null}
                </div>
              </details>
            ) : (
              "—"
            )}
          </ReviewCell>
        </ReviewTableRow>
      ))}
    </ReviewTable>
  );
}

export function CanonicalReview({
  presentation,
  spaceId,
  todayKey,
}: {
  presentation: OperationalReviewDayPresentation;
  spaceId: string | null;
  todayKey: string;
}) {
  const subtitle = presentation.isToday
    ? `${presentation.serviceDateLabel}. This is Review for the current service day — live work continues in Run.`
    : `${presentation.serviceDateLabel}. What was supposed to happen, what actually happened, and where the operation differed.`;

  const serviceRows = presentation.service.cycles.flatMap((cycle) =>
    cycle.milestones.map((milestone, index) => ({
      key: `${cycle.stableKey}-${milestone.kindLabel}-${index}`,
      cycleLabel: cycle.periodLabel ? `${cycle.label} (${cycle.periodLabel})` : cycle.label,
      milestone,
    })),
  );

  return (
    <section className="space-y-6" data-testid="canonical-review">
      <PageHeader
        icon="review"
        title="Review"
        subtitle={subtitle}
        below={
          <div className="space-y-4">
            <ReviewModeNav activeId="review" date={presentation.serviceDate} spaceId={spaceId} />
            <ReviewDateForm
              start={presentation.serviceDate}
              end={presentation.serviceDate}
              todayKey={todayKey}
              spaceId={spaceId}
              locationOptions={presentation.locationOptions}
              testId="review-date-form"
            />
          </div>
        }
      />

      {presentation.empty ? (
        <EmptyState
          icon="review"
          tone="neutral"
          title="No operational Review items were found for this service day."
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <ReviewCard title="Day summary" testId="review-day-summary">
            {presentation.quiet && presentation.unavailableDomains.length === 0 ? (
              <ReviewMuted>No operational exceptions were identified for this service day.</ReviewMuted>
            ) : (
              <div className="space-y-3">
                {presentation.summaryItems.length > 0 ? (
                  <ReviewCountList items={presentation.summaryItems} />
                ) : null}
                {presentation.unavailableDomains.length > 0 ? (
                  <ReviewCountList items={presentation.unavailableDomains} />
                ) : null}
              </div>
            )}
          </ReviewCard>

          <ReviewCard
            title="Locations"
            subtitle="What happened in each space on this service date."
            testId="review-locations"
          >
            {presentation.locations.length === 0 ? (
              <ReviewMuted>No operational spaces matched this filter.</ReviewMuted>
            ) : (
              <ReviewTable
                caption="What happened for this service day"
                columns={["Location", "Happened", "Planned vs actual", "Issues"]}
              >
                {presentation.locations.map((location) => (
                  <ReviewTableRow key={location.spaceId}>
                    <ReviewCell>
                      {location.currentLocationHref ? (
                        <Link href={location.currentLocationHref} className="hover:underline">
                          {location.displayLabel}
                        </Link>
                      ) : (
                        location.displayLabel
                      )}
                      {location.operationalTypeName ? (
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {location.operationalTypeName}
                        </span>
                      ) : null}
                    </ReviewCell>
                    <ReviewCell>
                      {location.happeningLabel ?? location.paceLabel ?? "—"}
                      {location.paceLabel && location.happeningLabel !== location.paceLabel ? (
                        <span className="mt-0.5 block text-xs text-zinc-500">{location.paceLabel}</span>
                      ) : null}
                    </ReviewCell>
                    <ReviewCell>
                      {location.plannedLabel || location.actualLabel
                        ? [location.plannedLabel, location.actualLabel].filter(Boolean).join(" → ")
                        : (location.parentUnitLabel ?? "—")}
                      {location.assignedLabel ? (
                        <span className="mt-0.5 block text-xs text-zinc-500">{location.assignedLabel}</span>
                      ) : null}
                    </ReviewCell>
                    <ReviewCell>
                      <ReviewStatus kind={location.exceptionCount > 0 ? "alert" : "ok"}>
                        {location.evidenceLabel ?? location.exceptionSummary}
                      </ReviewStatus>
                    </ReviewCell>
                  </ReviewTableRow>
                ))}
              </ReviewTable>
            )}
          </ReviewCard>
        </section>
      )}

      <ReviewCard
        title="Evidence"
        subtitle="Expected Harbor occurrences and recorded results for this service day."
        testId="review-evidence"
      >
        {presentation.evidence.unavailableMessage ? (
          <UnavailableBanner message={presentation.evidence.unavailableMessage} />
        ) : null}
        {presentation.evidence.attention.length > 0 ? (
          <EvidenceTable rows={presentation.evidence.attention} caption="Evidence requiring attention" />
        ) : presentation.evidence.availability.status === "evaluated" &&
          presentation.evidence.completed.length === 0 ? (
          <ReviewMuted>No evidence expectations for this service day.</ReviewMuted>
        ) : null}
        {presentation.evidence.completed.length > 0 ? (
          <details className={presentation.evidence.attention.length > 0 ? "mt-4" : undefined}>
            <summary className="cursor-pointer text-sm font-medium text-zinc-700">
              Completed evidence ({presentation.evidence.completed.length})
            </summary>
            <div className="mt-3">
              <EvidenceTable rows={presentation.evidence.completed} caption="Completed evidence" />
            </div>
          </details>
        ) : null}
      </ReviewCard>

      <section className="grid gap-4 lg:grid-cols-2">
        <ReviewCard
          title="Staffing & Coverage"
          subtitle="Published responsibility versus assigned responsibility."
          testId="review-coverage"
        >
          {presentation.coverage.unavailableMessage ? (
            <UnavailableBanner message={presentation.coverage.unavailableMessage} />
          ) : null}
          {presentation.coverage.assignmentEditLimitation ? (
            <p className="mb-3 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              {presentation.coverage.assignmentEditLimitation}
            </p>
          ) : null}
          {presentation.coverage.slots.length === 0 &&
          presentation.coverage.availability.status === "evaluated" ? (
            <ReviewMuted>No published coverage expectation for this service day.</ReviewMuted>
          ) : presentation.coverage.slots.length > 0 ? (
            <ReviewTable
              caption="Coverage expectation versus assigned actual"
              columns={["Location", "Cycle", "Role", "Required", "Assigned", "State"]}
            >
              {presentation.coverage.slots.map((row) => (
                <ReviewTableRow key={`${row.spaceId}-${row.roleLabel}-${row.cycleLabel ?? "none"}`}>
                  <ReviewCell>{row.locationLabel}</ReviewCell>
                  <ReviewCell>{row.cycleLabel ?? "—"}</ReviewCell>
                  <ReviewCell>{row.roleLabel}</ReviewCell>
                  <ReviewCell>{row.requiredCount}</ReviewCell>
                  <ReviewCell>{row.assignedCount}</ReviewCell>
                  <ReviewCell>
                    <ReviewStatus kind={coverageStatusKind(row.state)}>{row.stateLabel}</ReviewStatus>
                  </ReviewCell>
                </ReviewTableRow>
              ))}
            </ReviewTable>
          ) : null}
        </ReviewCard>

        <ReviewCard title="Presence" subtitle="Schedule and call-off context only. This is not an attendance record.">
          {presentation.presence.scheduled.length === 0 &&
          presentation.presence.exceptions.length === 0 ? (
            <ReviewMuted>No schedule or call-off entries for this service day.</ReviewMuted>
          ) : (
            <ReviewTable caption="Presence context" columns={["Kind", "Person"]}>
              {presentation.presence.scheduled.map((row) => (
                <ReviewTableRow key={row.scheduleEntryId}>
                  <ReviewCell>Scheduled</ReviewCell>
                  <ReviewCell>{row.employeeDisplayName}</ReviewCell>
                </ReviewTableRow>
              ))}
              {presentation.presence.exceptions.map((row) => (
                <ReviewTableRow key={row.overrideId}>
                  <ReviewCell>{presenceExceptionLabel(row.kind)}</ReviewCell>
                  <ReviewCell>{row.employeeDisplayName}</ReviewCell>
                </ReviewTableRow>
              ))}
            </ReviewTable>
          )}
          {presentation.coverage.assignments.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Assigned responsibility
              </p>
              <ReviewTable caption="Assigned responsibility" columns={["Person", "Role"]}>
                {presentation.coverage.assignments.map((row) => (
                  <ReviewTableRow key={row.id}>
                    <ReviewCell>{row.employeeDisplayName ?? "Unassigned"}</ReviewCell>
                    <ReviewCell>{row.roleKey}</ReviewCell>
                  </ReviewTableRow>
                ))}
              </ReviewTable>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No operational assignments recorded.</p>
          )}
        </ReviewCard>
      </section>

      <ReviewCard
        title="Service"
        subtitle="Date-effective cycles and recorded milestones."
        testId="review-service"
      >
        {presentation.service.unavailableMessage ? (
          <UnavailableBanner message={presentation.service.unavailableMessage} />
        ) : null}
        {presentation.service.cycles.length === 0 &&
        presentation.service.availability.status === "evaluated" ? (
          <ReviewMuted>No service cycles were effective for this date.</ReviewMuted>
        ) : serviceRows.length === 0 ? (
          <ReviewMuted>No milestones configured for this cycle.</ReviewMuted>
        ) : (
          <ReviewTable
            caption="Service milestones"
            columns={["Cycle", "Milestone", "Expected", "Actual", "Status"]}
          >
            {serviceRows.map((row) => (
              <ReviewTableRow key={row.key}>
                <ReviewCell>{row.cycleLabel}</ReviewCell>
                <ReviewCell>{row.milestone.kindLabel}</ReviewCell>
                <ReviewCell>{row.milestone.expectedTimeLabel ?? "—"}</ReviewCell>
                <ReviewCell>{row.milestone.actualTimeLabel ?? "—"}</ReviewCell>
                <ReviewCell>
                  <ReviewStatus
                    kind={
                      row.milestone.varianceLabel?.includes("late")
                        ? "alert"
                        : row.milestone.missing
                          ? "alert"
                          : "ok"
                    }
                  >
                    {row.milestone.varianceLabel ??
                      (row.milestone.missing ? "Not recorded" : "Recorded")}
                  </ReviewStatus>
                </ReviewCell>
              </ReviewTableRow>
            ))}
          </ReviewTable>
        )}
      </ReviewCard>

      {presentation.assets.rows.length > 0 ? (
        <ReviewCard title="Asset impact" subtitle="Issues that affected operation that day." testId="review-assets">
          <ReviewTable caption="Asset operational impacts" columns={["Impact", "Location", "Observed", "Record"]}>
            {presentation.assets.rows.map((row) => (
              <ReviewTableRow key={row.issueId}>
                <ReviewCell>{row.impactLabel}</ReviewCell>
                <ReviewCell>{row.locationLabel || "—"}</ReviewCell>
                <ReviewCell>{row.observedAtLabel || "—"}</ReviewCell>
                <ReviewCell>
                  <Link href={row.href} className="underline underline-offset-2">
                    Asset issue
                  </Link>
                </ReviewCell>
              </ReviewTableRow>
            ))}
          </ReviewTable>
        </ReviewCard>
      ) : null}
    </section>
  );
}
