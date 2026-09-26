/**
 * Run Review. Day Locations replay Runtime Location State answers (step 22).
 * Historical evidence / coverage / service tables stay the day record. See
 * docs/department-administration/14_RUN_SURFACE_REFERENCE_FREEZE.md
 */
import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/design-system";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  loadOperationalReviewDay,
  loadOperationalReviewRange,
  presentOperationalReviewDay,
  presentOperationalReviewRange,
} from "@/lib/operational-review";
import { presentReviewLocationsFromRuntime } from "@/lib/operational-review/present-review-locations-from-runtime";
import { parseFacilityLocalScheduledStart } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { loadRuntimeLocationStates } from "@/lib/runtime-location-state";

import { CanonicalRangeReview } from "./canonical-range-review";
import { CanonicalReview } from "./canonical-review";
import { LegacyReport } from "./legacy-report";
import { ReviewModeNav } from "./review-mode-nav";

type ReportsPageProps = {
  searchParams: Promise<{
    view?: string;
    mode?: string;
    date?: string;
    spaceId?: string;
    start?: string;
    end?: string;
    unitId?: string;
    repairStatus?: string;
  }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  noStore();
  const params = await searchParams;

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const facilityId = session.facilityId;
  const legacyMode = params.view === "legacy";
  const start = params.start?.trim() || "";
  const end = params.end?.trim() || "";
  const rangeMode = !legacyMode && Boolean(start && end && start !== end);
  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
  const spaceId = params.spaceId?.trim() || null;

  if (legacyMode) {
    return (
      <section className="space-y-6" data-testid="reports-page-legacy">
        <PageHeader
          icon="review"
          title="Legacy Report"
          subtitle="Previous reporting model. Use Review for date-effective operational history."
          below={<ReviewModeNav activeId="legacy" date={params.start ?? params.date} />}
        />
        <LegacyReport facilityId={facilityId} params={params} />
      </section>
    );
  }

  if (rangeMode) {
    const loaded = await loadOperationalReviewRange({
      client: prisma,
      facilityId,
      startServiceDate: params.start,
      endServiceDate: params.end,
      departmentId: deptNav.activeDepartmentId,
    });
    if (!loaded.ok) {
      const fallback = params.start?.trim() || loaded.todayKey;
      return (
        <CanonicalRangeReview
          presentation={null}
          spaceId={spaceId}
          start={fallback}
          end={params.end?.trim() || loaded.todayKey}
          todayKey={loaded.todayKey}
          validationMessage={loaded.validation.message}
        />
      );
    }
    return (
      <CanonicalRangeReview
        presentation={presentOperationalReviewRange(loaded.model, { spaceId })}
        spaceId={spaceId}
        start={loaded.model.startServiceDate}
        end={loaded.model.endServiceDate}
        todayKey={loaded.model.todayKey}
      />
    );
  }

  const { facts, model } = await loadOperationalReviewDay({
    client: prisma,
    facilityId,
    serviceDate: params.date || start || end || undefined,
    departmentId: deptNav.activeDepartmentId,
  });
  const presentation = presentOperationalReviewDay(model, {
    spaceId,
    todayKey: facts.todayKey,
  });
  const departmentId = facts.departmentId ?? facts.departmentIds[0] ?? "";
  const reviewNow =
    facts.serviceDate === facts.todayKey
      ? facts.now
      : (parseFacilityLocalScheduledStart(
          "12:00",
          new Date(`${facts.serviceDate}T12:00:00.000Z`),
          facts.timezone,
        ) ?? facts.now);
  const runtime =
    facts.spaces.length > 0
      ? await loadRuntimeLocationStates({
          facilityId,
          spaceRefs: facts.spaces.map((space) => ({
            spaceId: space.spaceId,
            departmentId,
            unitId: space.parentUnitId,
            displayName: space.displayLabel,
          })),
          now: reviewNow,
          operationalDateKey: facts.serviceDate,
        })
      : { states: [] };

  const replayStates = spaceId
    ? runtime.states.filter((state) => state.identity.location.spaceId === spaceId)
    : runtime.states;

  return (
    <CanonicalReview
      presentation={{
        ...presentation,
        locations:
          replayStates.length > 0
            ? presentReviewLocationsFromRuntime(replayStates)
            : presentation.locations,
      }}
      spaceId={spaceId}
      todayKey={facts.todayKey}
    />
  );
}
