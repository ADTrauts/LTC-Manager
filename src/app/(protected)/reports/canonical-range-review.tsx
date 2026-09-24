import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/design-system";
import type { OperationalReviewRangePresentation } from "@/lib/operational-review/present-operational-review-range";

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

export function CanonicalRangeReview({
  presentation,
  spaceId,
  start,
  end,
  todayKey,
  validationMessage,
}: {
  presentation: OperationalReviewRangePresentation | null;
  spaceId: string | null;
  start: string;
  end: string;
  todayKey: string;
  validationMessage?: string | null;
}) {
  const locationOptions = presentation?.locationOptions ?? [];
  return (
    <section className="space-y-6" data-testid="canonical-range-review">
      <PageHeader
        icon="review"
        title="Review"
        subtitle={
          presentation
            ? `${presentation.rangeLabel}. Exception patterns across independently evaluated service days.`
            : "Select an inclusive facility service-date range. Each day is evaluated on its own historical configuration."
        }
        below={
          <div className="space-y-4">
            <ReviewModeNav activeId="review" date={end || todayKey} spaceId={spaceId} />
            <ReviewDateForm
              start={start}
              end={end}
              todayKey={todayKey}
              spaceId={spaceId}
              locationOptions={locationOptions}
              testId="review-range-form"
            />
          </div>
        }
      />

      {validationMessage ? (
        <p
          className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
          data-testid="review-range-validation"
        >
          {validationMessage}
        </p>
      ) : null}

      {presentation ? (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <ReviewCard title="Range summary" testId="review-range-summary">
              {presentation.empty ? (
                <EmptyState
                  icon="review"
                  tone="neutral"
                  title="No operational Review items were found for this date range."
                />
              ) : presentation.quiet ? (
                <ReviewMuted>No operational exceptions were identified for this date range.</ReviewMuted>
              ) : (
                <div className="space-y-3">
                  {presentation.summaryItems.length > 0 ? (
                    <ReviewCountList items={presentation.summaryItems} />
                  ) : null}
                  {presentation.unavailableItems.length > 0 ? (
                    <ReviewCountList items={presentation.unavailableItems} />
                  ) : null}
                </div>
              )}
              {presentation.evidenceEvaluated ? (
                <p className="mt-3 text-sm text-zinc-600">{presentation.evidenceEvaluated}</p>
              ) : null}
            </ReviewCard>

            <ReviewCard
              title="Daily Review"
              subtitle="Each service day uses its own date-effective configuration."
              testId="review-range-days"
            >
              <ReviewTable caption="Daily Review" columns={["Service date", "Exceptions"]}>
                {presentation.days.map((day) => (
                  <ReviewTableRow key={day.serviceDate}>
                    <ReviewCell>
                      <Link href={day.href} className="font-medium hover:underline">
                        {day.serviceDateLabel}
                      </Link>
                    </ReviewCell>
                    <ReviewCell>
                      <ReviewStatus
                        kind={
                          day.empty
                            ? "neutral"
                            : day.quiet && day.unavailableLabels.length === 0
                              ? "ok"
                              : "alert"
                        }
                      >
                        {day.empty
                          ? "No operational Review items"
                          : day.quiet && day.unavailableLabels.length === 0
                            ? "No exceptions"
                            : [...day.exceptionLabels, ...day.unavailableLabels].join(" · ") ||
                              "Open day"}
                      </ReviewStatus>
                    </ReviewCell>
                  </ReviewTableRow>
                ))}
              </ReviewTable>
            </ReviewCard>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ReviewCard
              title="Evidence"
              subtitle="Repeated factual exceptions across the range."
              testId="review-range-evidence"
            >
              {presentation.repeatedEvidence.length > 0 ? (
                <ReviewTable caption="Repeated evidence exceptions" columns={["Requirement", "Missed days"]}>
                  {presentation.repeatedEvidence.map((row) => (
                    <ReviewTableRow key={row.id}>
                      <ReviewCell>
                        <Link href={row.href} className="hover:underline">
                          {row.label}
                        </Link>
                      </ReviewCell>
                      <ReviewCell>
                        <ReviewStatus kind="alert">{row.missedDays}</ReviewStatus>
                      </ReviewCell>
                    </ReviewTableRow>
                  ))}
                </ReviewTable>
              ) : (
                <ReviewMuted>
                  No repeated evidence exceptions in this range. Open a service day for detail.
                </ReviewMuted>
              )}
            </ReviewCard>

            <ReviewCard
              title="Staffing & Coverage"
              subtitle="Published responsibility versus operational assignment. Schedule is presence only."
              testId="review-range-coverage"
            >
              <ReviewCountList
                items={[
                  {
                    id: "scheduled",
                    name: "Scheduled presence entries",
                    count: presentation.presence.scheduledCount,
                    label: `${presentation.presence.scheduledCount} scheduled presence entries`,
                  },
                  {
                    id: "overrides",
                    name: "Call-off and override events",
                    count: presentation.presence.exceptionCount,
                    label: `${presentation.presence.exceptionCount} call-off and override events`,
                  },
                ]}
              />
              <p className="mt-3 text-xs text-zinc-500">This is not an attendance record.</p>
            </ReviewCard>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ReviewCard
              title="Service"
              subtitle="Service timing is evaluated per day from the cycle version effective that date."
              testId="review-range-service"
            >
              <ReviewMuted>
                Open a service day for expected versus actual milestones.
              </ReviewMuted>
            </ReviewCard>

            {presentation.assets.impactCount > 0 ? (
              <ReviewCard title="Asset impact" testId="review-range-assets">
                <ReviewCountList
                  items={[
                    {
                      id: "asset-impacts",
                      name: "Operational impacts",
                      count: presentation.assets.impactCount,
                      label: `${presentation.assets.impactCount} operational impacts`,
                    },
                    {
                      id: "asset-days",
                      name: "Service days with impact",
                      count: presentation.assets.impactDays,
                      label: `${presentation.assets.impactDays} service days with impact`,
                    },
                  ]}
                />
              </ReviewCard>
            ) : (
              <ReviewCard title="Asset impact">
                <ReviewMuted>No operational asset impacts in this range.</ReviewMuted>
              </ReviewCard>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
