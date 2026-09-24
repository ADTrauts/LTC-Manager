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
import { prisma } from "@/lib/prisma";

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

  return (
    <CanonicalReview
      presentation={presentation}
      spaceId={spaceId}
      todayKey={facts.todayKey}
    />
  );
}
