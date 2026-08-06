import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OfflineConflictReview } from "@/components/offline/offline-conflict-review";
import { OfflineServeryControls } from "@/components/offline/offline-servery-controls";
import { EmployeeJobFlowPanel } from "@/components/unit-workspace/employee-job-flow-panel";
import { EvidenceEntryForm } from "@/components/operational-evidence/evidence-entry-form";
import { UnitContextPanel } from "@/components/unit-workspace/unit-context-panel";
import { UnitCycleContextPanel } from "@/components/unit-workspace/unit-cycle-context-panel";
import { UnitInspectionFollowUpActions } from "@/components/unit-workspace/unit-inspection-follow-up-actions";
import { UnitInspectionSubmitForm } from "@/components/unit-workspace/unit-inspection-submit-form";
import { UnitInspectionsPanel } from "@/components/unit-workspace/unit-inspections-panel";
import { UnitMyAssignmentPanel } from "@/components/unit-workspace/unit-my-assignment-panel";
import { UnitOperationContextHeader } from "@/components/unit-workspace/unit-operation-context-header";
import { UnitQuickIssuePanel } from "@/components/unit-workspace/unit-quick-issue-panel";
import { UnitWorkQueuePanel } from "@/components/unit-workspace/unit-work-queue-panel";
import { ProjectedUnitWorkspaceBody } from "@/components/unit-workspace/projected-experience-panels";
import { ContextualKnowledgePanel } from "@/components/knowledge/contextual-knowledge-panel";
import { PageHeader } from "@/components/design-system/page-header";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { departmentFilterIdsForSession } from "@/lib/department-scope";
import { resolveLocationIconKey } from "@/lib/design-system";
import { loadEmployeeJobFlow } from "@/lib/dietary-job-flow";
import {
  isDietaryJobFlowEnabled,
  isDietaryOperationalCyclesEnabled,
  isOperationalAssignmentsEnabled,
  isProjectionUnitWorkspaceEnabled,
} from "@/lib/feature-flags";
import { loadContextualKnowledge } from "@/lib/knowledge/contextual";
import { loadEmployeeCycleContext } from "@/lib/operational-cycles";
import { fmtMealLabel } from "@/lib/operations-center";
import { prisma } from "@/lib/prisma";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import { loadEmployeeAssignmentsToday } from "@/lib/scheduling/operational-assignments";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { actorRefForSession } from "@/lib/offline/resolve-milestone-actor";
import { sessionUserIdForFk } from "@/lib/auth";
import {
  describeMealServiceContext,
  evaluateServeryMilestoneAccess,
  recordableMealForContext,
  resolveServeryMealServiceContext,
  roleMayCorrectMilestones,
} from "@/lib/servery";
import {
  loadUnitRecord,
  loadUnitWorkspace,
  loadUnitWorkspaceProjection,
} from "@/lib/unit-workspace";

type UnitDashboardPageProps = {
  params: Promise<{ unitId: string }>;
  searchParams?: Promise<{
    mealServiceEvent?: string;
    unitTab?: string;
    logTab?: string;
    inspect?: string;
    inspectionResult?: string;
    inspectionName?: string;
    followUpTask?: string;
    occurrence?: string;
    evidence?: string;
  }>;
};

function formatRecordedAt(value: Date | null) {
  if (!value) return "Not recorded";
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function ProjectedUnitWorkspacePage({
  session,
  unitId,
}: {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  unitId: string;
}) {
  const unit = await loadUnitRecord(session.facilityId, unitId);
  if (!unit) {
    notFound();
  }

  const memo = createProjectionRuntimeRequestScope();
  const projection = await loadUnitWorkspaceProjection(session, unitId, { memo });
  const unitTypeLabel =
    unit.unitType.charAt(0) + unit.unitType.slice(1).toLowerCase().replace(/_/g, " ");

  const view = projection.view;
  if (!view) {
    return (
      <section className="mx-auto max-w-5xl space-y-5" data-testid="unit-workspace">
        <div
          className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm"
          role="status"
        >
          <p className="font-semibold text-zinc-900">Workspace unavailable</p>
          <p className="mt-1">{projection.error ?? "Projection could not be loaded."}</p>
        </div>
      </section>
    );
  }

  const dietary =
    isDietaryOperationalCyclesEnabled() || isDietaryJobFlowEnabled()
      ? await prisma.department.findFirst({
          where: { facilityId: session.facilityId, key: "DIETARY", isActive: true },
          select: { id: true },
        })
      : null;

  const sessionEmployeeId = await getOperationalEmployeeIdForSession(session);
  const jobFlow =
    dietary && isDietaryJobFlowEnabled() && sessionEmployeeId
      ? await loadEmployeeJobFlow({
          session,
          facilityId: session.facilityId,
          departmentId: dietary.id,
          employeeId: sessionEmployeeId,
          unitId: unit.id,
        })
      : null;

  const cycleContextCard =
    dietary && isDietaryOperationalCyclesEnabled() && !jobFlow
      ? await loadEmployeeCycleContext({
          facilityId: session.facilityId,
          departmentId: dietary.id,
          unitId: unit.id,
          session,
        })
      : null;

  return (
    <section className="mx-auto max-w-5xl space-y-5 sm:space-y-6" data-testid="unit-workspace">
      <header className="space-y-3 border-b border-zinc-200 pb-4 sm:pb-5">
        <PageHeader
          icon={resolveLocationIconKey({ unitType: unit.unitType, name: unit.name })}
          eyebrow="Orientation"
          title={unit.name}
          subtitle={`${unitTypeLabel} · ${view.level2Label} workspace`}
          compact
          as="div"
          className="border-0 pb-0"
        />
        {view.lensMode === "FACILITY" ? (
          <p className="text-xs text-zinc-500">
            Facility Overview — Experiences remain department-labeled below.
          </p>
        ) : null}
      </header>
      {jobFlow ? (
        <EmployeeJobFlowPanel
          jobFlow={jobFlow}
          canManage={false}
          departmentId={dietary?.id ?? null}
        />
      ) : null}
      {cycleContextCard ? (
        <UnitCycleContextPanel card={cycleContextCard} canManage={false} />
      ) : null}
      <ProjectedUnitWorkspaceBody view={view} unitName={unit.name} />
    </section>
  );
}

export default async function UnitDashboardPage({ params, searchParams }: UnitDashboardPageProps) {
  noStore();
  const { unitId } = await params;
  const query = searchParams ? await searchParams : undefined;

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  if (isProjectionUnitWorkspaceEnabled()) {
    return <ProjectedUnitWorkspacePage session={session} unitId={unitId} />;
  }

  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
  const view = await loadUnitWorkspace(session.facilityId, unitId, {
    unitTab: query?.unitTab,
    logTab: query?.logTab,
    mealServiceEvent: query?.mealServiceEvent,
    inspect: query?.inspect,
    inspectionResult: query?.inspectionResult,
    inspectionName: query?.inspectionName,
    followUpTask: query?.followUpTask,
    occurrence: query?.occurrence,
  }, {
    activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
  });

  if (!view) {
    notFound();
  }

  const {
    unit,
    queries: {
      assignments,
      submissions,
      schedulesToday,
      openRepairs,
      mealServiceHistory,
    },
    activeUnitTab,
    activeLogTab,
    logTabs,
    selectedLogCategory,
    selectedLogHistory,
    expected,
    completed,
    failed,
    missed,
    pending,
    movedOut,
    movedIn,
    effectiveCoverage,
    mealServiceEventMessage,
    mealServiceEventByMeal,
    menuSettings,
    menuUnavailableReason,
    todaysMenu,
    now,
    operationContext,
    workQueue,
    readiness,
    availableInspections,
    inspectionHistory,
    openInspectionFollowUps,
    activeInspectId,
    activeOccurrenceId,
    activeFollowUpTaskId,
    inspectionResultMessage,
    facilityTimezone,
  } = view;

  const activeFollowUp = activeFollowUpTaskId
    ? openInspectionFollowUps.find((task) => task.id === activeFollowUpTaskId) ?? null
    : null;

  const employeeLabel = (employee?: { firstName: string; lastName: string } | null) =>
    employee ? `${employee.firstName} ${employee.lastName}`.trim() : null;

  const sessionEmployeeId = await getOperationalEmployeeIdForSession(session);

  const mealServiceContext = resolveServeryMealServiceContext({
    unitType: unit.unitType,
    mealTimes: unit.mealTimes,
    now,
    facilityTimezone,
  });

  // The buttons offered come from the same evaluation the write path uses, so the interface cannot
  // present an action the server would refuse.
  const milestoneAccess =
    unit.unitType === "SERVERY"
      ? await evaluateServeryMilestoneAccess({
          facilityId: session.facilityId,
          unitId: unit.id,
          action: "RECORD",
          actor: {
            userId: sessionUserIdForFk(session),
            employeeId: sessionEmployeeId,
            role: session.role,
            authMethod: session.authMethod === "QUICK_PIN" ? "QUICK_PIN" : "PASSWORD",
          },
          deviceBoundUnitId: (await cookies()).get(DEVICE_UNIT_COOKIE)?.value?.trim() || null,
        })
      : null;
  const canRecordMilestones = milestoneAccess?.ok === true;
  const canCorrectMilestones =
    canRecordMilestones && roleMayCorrectMilestones(session.role);

  const activeInspectionDefinition = activeInspectId
    ? await prisma.inspectionDefinition.findFirst({
        where: {
          id: activeInspectId,
          facilityId: session.facilityId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              label: true,
              description: true,
              sortOrder: true,
              isRequired: true,
              responseType: true,
            },
          },
        },
      })
    : null;

  const unitAssets = await prisma.asset.findMany({
    where: { unitId: unit.id, status: "ACTIVE" },
    orderBy: { name: "asc" },
    take: 40,
    select: { id: true, name: true },
  });

  const viewerDepartmentIds = deptNav.showAllDepartmentNav
    ? null
    : deptNav.activeDepartmentId
      ? [deptNav.activeDepartmentId]
      : await departmentFilterIdsForSession(session);

  const [unitKnowledge, inspectionKnowledge] = await Promise.all([
    loadContextualKnowledge({
      facilityId: session.facilityId,
      viewerDepartmentIds,
      unitId: unit.id,
      includeFacilityWideReference: true,
      limit: 8,
    }),
    activeInspectionDefinition
      ? loadContextualKnowledge({
          facilityId: session.facilityId,
          viewerDepartmentIds,
          unitId: unit.id,
          inspectionDefinitionId: activeInspectionDefinition.id,
          includeFacilityWideReference: false,
          limit: 6,
        })
      : Promise.resolve({ articles: [], count: 0 }),
  ]);

  const myAssignment = isOperationalAssignmentsEnabled()
    ? sessionEmployeeId
      ? await loadEmployeeAssignmentsToday(sessionEmployeeId, session.facilityId, now)
      : null
    : null;

  const dietaryDepartment =
    isDietaryOperationalCyclesEnabled() || isDietaryJobFlowEnabled()
      ? await prisma.department.findFirst({
          where: {
            facilityId: session.facilityId,
            key: "DIETARY",
            isActive: true,
          },
          select: { id: true },
        })
      : null;

  const jobFlowEnabled = isDietaryJobFlowEnabled();
  const jobFlow =
    jobFlowEnabled && dietaryDepartment != null && sessionEmployeeId
      ? await loadEmployeeJobFlow({
          session,
          facilityId: session.facilityId,
          departmentId: dietaryDepartment.id,
          employeeId: sessionEmployeeId,
          unitId: unit.id,
          now,
        })
      : null;

  const cycleContextCard =
    !jobFlow && dietaryDepartment != null && isDietaryOperationalCyclesEnabled()
      ? await loadEmployeeCycleContext({
          session,
          facilityId: session.facilityId,
          departmentId: dietaryDepartment.id,
          unitId: unit.id,
          now,
        })
      : null;

  const canManageCycles = hasAtLeastRole(session.role, "MANAGER");

  const cookieJar = await cookies();
  const deviceFacilityId = cookieJar.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null;
  const deviceBoundUnitId = cookieJar.get(DEVICE_UNIT_COOKIE)?.value?.trim() || null;

  const openOfflineConflicts = await prisma.offlineConflict.findMany({
    where: {
      facilityId: session.facilityId,
      unitId: unit.id,
      resolution: "PENDING",
    },
    select: {
      clientCommandId: true,
      conflictCategory: true,
      commandPayload: true,
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const conflictRows = openOfflineConflicts.map((c) => {
    const payload = c.commandPayload as {
      mealType?: string;
      commandType?: string;
      occurredAt?: string;
    };
    return {
      clientCommandId: c.clientCommandId,
      conflictCategory: c.conflictCategory,
      mealType: payload.mealType ?? "UNKNOWN",
      commandType: payload.commandType ?? "UNKNOWN",
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    };
  });

  const unitTypeLabel =
    unit.unitType.charAt(0) + unit.unitType.slice(1).toLowerCase().replace(/_/g, " ");

  return (
    <section className="mx-auto max-w-5xl space-y-5 sm:space-y-6" data-testid="unit-workspace">
      {mealServiceEventMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          {mealServiceEventMessage}
        </div>
      ) : null}

      {inspectionResultMessage ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900"
          data-testid="inspection-result-banner"
        >
          <p className="font-semibold">{inspectionResultMessage.title}</p>
          <p className="mt-0.5">{inspectionResultMessage.body}</p>
        </div>
      ) : null}

      <header className="space-y-3 border-b border-zinc-200 pb-4 sm:space-y-4 sm:pb-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] md:items-start md:gap-4">
          <UnitOperationContextHeader
            unitName={unit.name}
            unitType={unit.unitType}
            unitTypeLabel={unitTypeLabel}
            context={operationContext}
            readiness={readiness}
          />
          {unit.unitType === "SERVERY" ? (
            <OfflineServeryControls
              unitId={unit.id}
              facilityId={session.facilityId}
              sessionVersion={session.sessionVersion ?? 0}
              actorRef={actorRefForSession(session)}
              deviceFacilityId={deviceFacilityId}
              deviceBoundUnitId={deviceBoundUnitId}
              defaultMealType={recordableMealForContext(mealServiceContext)?.mealType ?? null}
              returnTab={activeUnitTab}
              returnLogTab={activeLogTab ?? ""}
              slots={unit.mealTimes}
              contextNote={describeMealServiceContext(mealServiceContext)}
              canRecord={canRecordMilestones}
              canCorrect={canCorrectMilestones}
              eventByMeal={Object.fromEntries(
                unit.mealTimes.map((slot) => {
                  const ev = mealServiceEventByMeal.get(slot.mealType);
                  const corrected = new Set(ev?.entries?.map((entry) => entry.milestone) ?? []);
                  return [
                    slot.mealType,
                    {
                      ready: {
                        occurredAt: ev?.mealServiceReadyAt?.toISOString() ?? null,
                        recordedAt: ev?.readyRecordedAt?.toISOString() ?? null,
                        recordedByLabel:
                          ev?.readyRecordedBy?.displayName ??
                          employeeLabel(ev?.readyRecordedByEmployee),
                        corrected: corrected.has("READY"),
                      },
                      started: {
                        occurredAt: ev?.mealServiceStartedAt?.toISOString() ?? null,
                        recordedAt: ev?.startedRecordedAt?.toISOString() ?? null,
                        recordedByLabel:
                          ev?.startedRecordedBy?.displayName ??
                          employeeLabel(ev?.startedRecordedByEmployee),
                        corrected: corrected.has("SERVICE_STARTED"),
                      },
                    },
                  ];
                }),
              )}
            />
          ) : null}
        </div>
        <nav className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Unit sections">
          <Link
            href={`/unit/${unit.id}?unitTab=overview`}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold touch-manipulation ${
              activeUnitTab === "overview"
                ? "bg-zinc-900 text-white shadow-sm"
                : "border-2 border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
            }`}
            aria-current={activeUnitTab === "overview" ? "page" : undefined}
          >
            Workspace
          </Link>
          <Link
            href={`/unit/${unit.id}?unitTab=logs${activeLogTab ? `&logTab=${encodeURIComponent(activeLogTab)}` : ""}`}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold touch-manipulation ${
              activeUnitTab === "logs"
                ? "bg-zinc-900 text-white shadow-sm"
                : "border-2 border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
            }`}
            aria-current={activeUnitTab === "logs" ? "page" : undefined}
          >
            Logs &amp; history
          </Link>
        </nav>
      </header>

      {conflictRows.length > 0 && canCorrectMilestones ? (
        <OfflineConflictReview unitId={unit.id} conflicts={conflictRows} />
      ) : null}

      {activeUnitTab === "overview" ? (
        <div className="space-y-6 sm:space-y-7">
          {jobFlow ? (
            <EmployeeJobFlowPanel
              jobFlow={jobFlow}
              canManage={canManageCycles && session.authMethod !== "QUICK_PIN"}
              departmentId={dietaryDepartment?.id ?? null}
            />
          ) : null}
          {jobFlow &&
          dietaryDepartment &&
          query?.evidence &&
          jobFlow.evidenceRequirements.some((r) => r.requirementKey === query.evidence) ? (
            <EvidenceEntryForm
              facilityId={session.facilityId}
              departmentId={dietaryDepartment.id}
              unitId={unit.id}
              requirement={
                jobFlow.evidenceRequirements.find((r) => r.requirementKey === query.evidence)!
              }
            />
          ) : null}
          {/* Assignment remains authoritative and visible even when Job Flow is on. */}
          {myAssignment ? <UnitMyAssignmentPanel assignment={myAssignment} /> : null}
          {!jobFlow && cycleContextCard ? (
            <UnitCycleContextPanel
              card={cycleContextCard}
              canManage={canManageCycles && session.authMethod !== "QUICK_PIN"}
            />
          ) : null}

          <UnitWorkQueuePanel queue={workQueue} />

          <div className="flex flex-wrap gap-2">
            <ContextualKnowledgePanel articles={unitKnowledge.articles} />
          </div>

          <UnitQuickIssuePanel unitId={unit.id} unitName={unit.name} assets={unitAssets} />

          {activeFollowUp ? (
            <UnitInspectionFollowUpActions unitId={unit.id} task={activeFollowUp} />
          ) : null}

          {activeInspectionDefinition ? (
            <div className="space-y-3">
              <ContextualKnowledgePanel
                articles={inspectionKnowledge.articles}
                variant="compact"
                title="Inspection guidance"
              />
              <UnitInspectionSubmitForm
                unitId={unit.id}
                definitionId={activeInspectionDefinition.id}
                definitionName={activeInspectionDefinition.name}
                description={activeInspectionDefinition.description}
                items={activeInspectionDefinition.items}
                occurrenceId={activeOccurrenceId}
              />
            </div>
          ) : null}

          <UnitInspectionsPanel
            unitId={unit.id}
            available={availableInspections}
            history={inspectionHistory}
            facilityTimezone={facilityTimezone}
            activeInspectId={activeInspectId}
          />

          <UnitContextPanel
            unit={unit}
            assignments={assignments}
            submissions={submissions}
            schedulesToday={schedulesToday}
            openRepairs={openRepairs}
            expected={expected}
            completed={completed}
            pending={pending}
            failed={failed}
            missed={missed}
            movedIn={movedIn}
            movedOut={movedOut}
            effectiveCoverage={effectiveCoverage}
            menuSettings={menuSettings}
            menuUnavailableReason={menuUnavailableReason}
            todaysMenu={todaysMenu}
            activeLogTab={activeLogTab}
          />
        </div>
      ) : null}

      {activeUnitTab === "logs" ? (
        <section className="space-y-4">
          <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Unit log categories">
            {logTabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/unit/${unit.id}?unitTab=logs&logTab=${encodeURIComponent(tab.key)}`}
                className={`inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold touch-manipulation ${
                  activeLogTab === tab.key
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "border-2 border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
                }`}
                aria-current={activeLogTab === tab.key ? "page" : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {logTabs.length === 0 ? (
            <article className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
              No unit log categories are assigned yet. When a log template is assigned to this unit, its category
              appears here automatically.
            </article>
          ) : null}

          {activeLogTab === "service-log" ? (
            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Service Log</h2>
              <p className="mt-1 text-sm text-zinc-600">
                History by meal and day. On the unit header, ready/started times show for one hour after each tap, then
                clear until recorded again.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500">
                      <th className="py-2 pr-3">Service Date</th>
                      <th className="py-2 pr-3">Meal</th>
                      <th className="py-2 pr-3">Ready At</th>
                      <th className="py-2 pr-3">Ready By</th>
                      <th className="py-2 pr-3">Started At</th>
                      <th className="py-2 pr-3">Started By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mealServiceHistory.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-3 text-zinc-700">{row.serviceDate.toLocaleDateString()}</td>
                        <td className="py-2 pr-3 text-zinc-700">{fmtMealLabel(row.mealType)}</td>
                        <td className="py-2 pr-3 text-zinc-700">{formatRecordedAt(row.mealServiceReadyAt)}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.readyRecordedBy?.displayName ?? "-"}</td>
                        <td className="py-2 pr-3 text-zinc-700">{formatRecordedAt(row.mealServiceStartedAt)}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.startedRecordedBy?.displayName ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mealServiceHistory.length === 0 ? (
                  <p className="pt-3 text-sm text-zinc-500">No meal service timestamps recorded for this unit yet.</p>
                ) : null}
              </div>
            </article>
          ) : null}

          {selectedLogCategory ? (
            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">{selectedLogCategory}</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Recent submissions for this unit in the selected log category.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500">
                      <th className="py-2 pr-3">Submitted</th>
                      <th className="py-2 pr-3">Template</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLogHistory.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-3 text-zinc-700">{row.submittedAt.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.template.name}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.status}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.submittedBy?.displayName ?? "Unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedLogHistory.length === 0 ? (
                  <p className="pt-3 text-sm text-zinc-500">No submissions in this category yet.</p>
                ) : null}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
