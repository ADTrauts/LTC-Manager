import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { PageHeader } from "@/components/design-system/page-header";
import { HandoffSummaryCards, TodaysWorkHandoffList } from "@/components/todays-work/todays-work-handoff-list";
import { ShiftTransitionSummaryCard } from "@/components/todays-work/shift-transition-summary-card";
import { TodaysWorkProjectionUnavailable } from "@/components/todays-work/todays-work-experience-contributions";
import { hasAtLeastRole } from "@/lib/access";
import { getOrGenerateShiftTransition } from "@/lib/ai/shift-transition";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isAiShiftSummaryEnabled, isProjectionTodaysWorkEnabled } from "@/lib/feature-flags";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import {
  assembleProjectedTodaysWorkHandoffs,
  filterCallDownsToProjectedUnits,
  loadOperatingLocationBoard,
  loadPresenceCallOffs,
  presentHandoffsFromBoard,
} from "@/lib/todays-work";

export default async function TodaysWorkHandoffsPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/dashboard");
  }

  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());

  let handoffs;

  if (isProjectionTodaysWorkEnabled()) {
    const assembled = await assembleProjectedTodaysWorkHandoffs(session, {
      memo: createProjectionRuntimeRequestScope(),
      activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
      activeDepartmentId: deptNav.activeDepartmentId,
    });
    if (assembled.enabled && "error" in assembled && assembled.error && !("handoffs" in assembled)) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-handoffs-page">
          <PageHeader icon="todaysWork" eyebrow="Today's Work" title="Handoffs" />
          <TodaysWorkProjectionUnavailable message={assembled.error} />
        </section>
      );
    }
    if (assembled.enabled && "handoffs" in assembled && assembled.handoffs) {
      handoffs = assembled.handoffs;
    }
  }

  if (!handoffs) {
    const [operating, callOffs] = await Promise.all([
      loadOperatingLocationBoard(session.facilityId, {
        session,
        activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
        activeDepartmentId: deptNav.activeDepartmentId,
      }),
      loadPresenceCallOffs(session.facilityId),
    ]);
    const scopedCallOffs = filterCallDownsToProjectedUnits(
      callOffs,
      operating.board.locations.map((location) => location.location.unitId),
    );
    handoffs = presentHandoffsFromBoard({
      board: operating.board,
      callOffs: scopedCallOffs,
      operationContext: operating.operationContext,
    });
  }

  const { sections, summary, isClear } = handoffs;

  const aiEnabled = isAiShiftSummaryEnabled();
  const shiftSummary = aiEnabled
    ? await getOrGenerateShiftTransition({
        facilityId: session.facilityId,
        departmentKey: deptNav.activeOperationalDepartmentKey,
        allowProvider: false,
      })
    : null;
  const canRefreshSummary = hasAtLeastRole(session.role, "MANAGER");

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-handoffs-page">
      <PageHeader
        icon="todaysWork"
        eyebrow="Today's Work"
        title="Handoffs"
        subtitle="What the next supervisor should know from current location state and today's call-offs."
        actions={
          <Link
            href="/today"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Back to hub
          </Link>
        }
      />

      {shiftSummary ? (
        <ShiftTransitionSummaryCard
          initialSummary={shiftSummary}
          departmentKey={deptNav.activeOperationalDepartmentKey ?? "DIETARY"}
          aiEnabled={aiEnabled}
          canRefresh={canRefreshSummary}
        />
      ) : null}

      {!isClear ? <HandoffSummaryCards summary={summary} /> : null}

      <TodaysWorkHandoffList sections={sections} isClear={isClear} />
    </section>
  );
}
