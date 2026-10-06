import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { IssueDetailActions } from "@/components/issues/issue-detail-actions";
import { RecoveryAssistantCard } from "@/components/issues/recovery-assistant-card";
import { ContextualKnowledgePanel } from "@/components/knowledge/contextual-knowledge-panel";
import { AppCard, PageHeader, StatusBadge } from "@/components/design-system";
import { PhotoFileField } from "@/components/photos/photo-file-field";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { addRepairPhotosAction, removeRepairPhotoAction } from "@/app/(protected)/repairs/actions";
import { WorkOrderExecutionPanel } from "@/components/work-orders/work-order-execution-panel";
import { WorkOrderCloseoutPanel } from "@/components/work-orders/work-order-closeout-panel";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { isDietaryAssetOperationsEnabled, isPlantOperationsEnabled } from "@/lib/feature-flags";
import { hasAtLeastRole } from "@/lib/access";
import { getOrGenerateRecoveryAssistant } from "@/lib/ai/recovery-assistant";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import {
  assetIssueStatusLabel,
  departmentDisplayLabel,
  formatAssetLocationLabel,
  isRepairCompletedStatus,
  preferredRepairProviderDisplayLabel,
  presentAssetLifecycleAndCondition,
  projectAssetResponsibility,
  repairSourceKind,
  repairSourceLabel,
  repairStatusProductLabel,
  responsibleOrganizationDisplayLabel,
  formatRecordedExpense,
  projectRecordedExpense,
  validateWorkOrderCloseout,
} from "@/lib/asset-operations";
import { getSession } from "@/lib/auth";
import { loadDepartmentsForCurrentSurface } from "@/lib/department-products";
import { departmentFilterIdsForSession } from "@/lib/department-scope";
import { isAiRecoveryAssistantEnabled } from "@/lib/feature-flags";
import { loadContextualKnowledge } from "@/lib/knowledge/contextual";
import { prisma } from "@/lib/prisma";
import { formatIssueTimestamp } from "@/lib/work/issues/format-issue-time";
import { presentPmWorkOrderContext } from "@/lib/preventive-maintenance/pm-context";
import { formatProjectedDateLabel } from "@/lib/preventive-maintenance/presentation";
import {
  presentPmOccurrenceStateLabel,
  presentPmWorkOrderKindLabel,
} from "@/lib/preventive-maintenance/run-board";
import { presentPmOccurrence } from "@/lib/preventive-maintenance/version-semantics";
import { facilityCivilToday } from "@/lib/preventive-maintenance/civil-date";
import {
  getIssueCopy,
  issueTypeIconKey,
  mapRepairStatusToRecoveryStage,
  priorityBadgeVariant,
  recoveryStageBadgeVariant,
  recoveryStageLabel,
} from "@/lib/work/issues/issue-copy";
import { MAX_REPAIR_PHOTOS_PER_SUBMIT } from "@/lib/photo-attachments";

type RepairDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function RepairDetailPage({ params }: RepairDetailPageProps) {
  noStore();
  const { id: repairId } = await params;

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const facility = await prisma.facility.findFirst({
    where: { id: session.facilityId },
    select: { id: true, timezone: true },
  });
  if (!facility) {
    redirect("/login");
  }

  const repair = await prisma.repair.findFirst({
    where: { id: repairId, unit: { facilityId: session.facilityId } },
    include: {
      unit: { select: { id: true, name: true, facilityId: true } },
      asset: {
        select: {
          id: true,
          assetCode: true,
          name: true,
          status: true,
          criticality: true,
          department: { select: { id: true, name: true } },
          responsibleOrganization: {
            select: { id: true, name: true, isActive: true },
          },
          vendor: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              contactName: true,
            },
          },
          space: { select: { name: true } },
        },
      },
      vendor: { select: { id: true, name: true } },
      reportedBy: { select: { id: true, displayName: true } },
      assignedEmployee: { select: { id: true, firstName: true, lastName: true } },
      requestingDepartment: { select: { id: true, name: true, key: true } },
      responsibleDepartment: { select: { id: true, name: true, key: true } },
      sourceAssetIssue: {
        select: { id: true, issueCode: true, summary: true, status: true },
      },
      issue: {
        select: { id: true, issueCode: true, summary: true, status: true },
      },
      space: { select: { id: true, name: true } },
      procedureVersion: { select: { id: true, version: true, title: true, status: true } },
      maintenanceCategory: { select: { label: true } },
      pmOccurrence: {
        select: {
          id: true,
          planId: true,
          scheduledDate: true,
          status: true,
          plan: { select: { asset: { select: { name: true, assetCode: true } } } },
          planVersion: {
            select: {
              name: true,
              maintenanceCategory: { select: { label: true } },
              procedureVersion: {
                select: { version: true, title: true, article: { select: { title: true } } },
              },
              recordRequirements: {
                select: { templateName: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
      evidenceLinks: {
        include: {
          evidenceRecord: {
            select: { id: true, templateName: true, status: true, occurredAt: true },
          },
        },
      },
      laborEntries: {
        orderBy: { recordedAt: "asc" },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      partsUsed: { orderBy: { createdAt: "asc" } },
      recordRequirements: {
        orderBy: { sortOrder: "asc" },
        include: {
          satisfiedByRecord: {
            select: {
              id: true,
              status: true,
              outOfStandard: true,
              templateName: true,
            },
          },
        },
      },
      sourceOperationalRequest: {
        select: { id: true, requestCode: true, summary: true, status: true },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, originalFilename: true, mimeType: true, createdAt: true },
      },
      updates: {
        orderBy: { updatedAt: "asc" },
        include: {
          updatedBy: { select: { displayName: true } },
        },
      },
    },
  });

  if (!repair) {
    notFound();
  }

  const [employees, departments, projectedTask, viewerDepartmentIds] = await Promise.all([
    prisma.employee.findMany({
      where: { facilityId: session.facilityId, status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 200,
      select: { id: true, firstName: true, lastName: true },
    }),
    loadDepartmentsForCurrentSurface(prisma, session.facilityId, session),
    prisma.task.findFirst({
      where: {
        facilityId: session.facilityId,
        sourceType: "REPAIR",
        sourceId: repair.id,
      },
      select: { id: true, status: true, title: true },
    }),
    departmentFilterIdsForSession(session),
  ]);

  const issueKnowledge = await loadContextualKnowledge({
    facilityId: session.facilityId,
    viewerDepartmentIds,
    unitId: repair.unitId,
    assetId: repair.assetId,
    includeFacilityWideReference: true,
    limit: 8,
  });

  const copy = getIssueCopy(repair.issueType);
  const stage = mapRepairStatusToRecoveryStage({
    status: repair.status,
    assignedEmployeeId: repair.assignedEmployeeId,
  });
  const assigneeName = repair.assignedEmployee
    ? `${repair.assignedEmployee.firstName} ${repair.assignedEmployee.lastName}`.trim()
    : null;
  const sessionEmployeeId = await getOperationalEmployeeIdForSession(session);
  const linkedIssue = repair.issue ?? repair.sourceAssetIssue;
  const isAssignedTechnician =
    Boolean(repair.assignedEmployeeId) &&
    (repair.assignedEmployeeId === sessionEmployeeId ||
      (session.authKind === "employee" && repair.assignedEmployeeId === session.uid));
  const canMutate = hasAtLeastRole(session.role, "SUPERVISOR") || isAssignedTechnician;
  const canAssign = hasAtLeastRole(session.role, "SUPERVISOR");
  const plantOrAssetOps = isDietaryAssetOperationsEnabled() || isPlantOperationsEnabled();
  const tz = facility.timezone;
  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
  const closeoutDepartmentId =
    repair.responsibleDepartmentId ?? deptNav.activeDepartmentId ?? repair.unit.facilityId;
  const [publishedTemplates, vendors] = canAssign
    ? await Promise.all([
        prisma.operationalTemplate.findMany({
          where: {
            facilityId: session.facilityId,
            status: "PUBLISHED",
            ...(repair.responsibleDepartmentId
              ? { departmentId: repair.responsibleDepartmentId }
              : {}),
          },
          select: { id: true, name: true, version: true },
          orderBy: [{ name: "asc" }, { version: "desc" }],
          take: 80,
        }),
        prisma.vendor.findMany({
          where: { facilityId: session.facilityId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 80,
        }),
      ])
    : [[], []];
  const closeoutExpense = projectRecordedExpense({
    parts: repair.partsUsed,
    externalCost: repair.externalCost,
  });
  const closeoutValidation = validateWorkOrderCloseout({
    workPerformed: repair.workPerformed,
    laborEntryCount: repair.laborEntries.length,
    requirements: repair.recordRequirements,
    hasAsset: Boolean(repair.assetId),
    assetConditionReview: repair.assetConditionReview,
  });
  const closeoutMissing: string[] = [];
  for (const fact of closeoutValidation.missing) {
    if (fact === "WORK_PERFORMED") closeoutMissing.push("Work performed");
    if (fact === "LABOR") closeoutMissing.push("Labor time");
    if (fact === "ASSET_CONDITION_REVIEW") closeoutMissing.push("Asset condition review");
    if (fact === "REQUIRED_RECORD") {
      closeoutMissing.push(...closeoutValidation.missingRecordLabels);
    }
  }
  const aiEnabled = isAiRecoveryAssistantEnabled();
  const canViewRecoveryAssistant = hasAtLeastRole(session.role, "SUPERVISOR");
  const canRefreshRecovery = hasAtLeastRole(session.role, "MANAGER");
  const recoveryGuidance =
    aiEnabled && canViewRecoveryAssistant
      ? await getOrGenerateRecoveryAssistant({
          facilityId: session.facilityId,
          issueId: repair.id,
          viewerDepartmentIds,
          departmentKey: deptNav.activeOperationalDepartmentKey,
          allowProvider: false,
        })
      : null;

  const assetOpsEnabled = isDietaryAssetOperationsEnabled();
  const sourceKind = repairSourceKind({
    workOrderKind: repair.workOrderKind,
    hasLinkedAssetIssue: Boolean(repair.sourceAssetIssue),
  });
  const pmContext = presentPmWorkOrderContext({
    workOrderKind: repair.workOrderKind,
    pmOccurrence: repair.pmOccurrence,
  });
  const responsibility = projectAssetResponsibility({
    department: repair.asset?.department ?? repair.responsibleDepartment,
    responsibleOrganization: repair.asset?.responsibleOrganization ?? null,
    preferredRepairProvider: repair.asset?.vendor ?? null,
  });
  const locationLabel = formatAssetLocationLabel({
    unitName: repair.unit.name,
    spaceName: repair.space?.name ?? repair.asset?.space?.name ?? null,
  });
  const assetCondition = repair.asset
    ? presentAssetLifecycleAndCondition(repair.asset.status)
    : null;
  const completed = isRepairCompletedStatus(repair.status);
  const assetStillOos =
    completed &&
    repair.asset &&
    (repair.asset.status === "OUT_OF_SERVICE" || repair.asset.status === "DEGRADED");

  return (
    <section
      className="mx-auto max-w-4xl space-y-6"
      data-testid="repair-detail"
      data-source-kind={sourceKind}
    >
      <PageHeader
        icon={issueTypeIconKey(repair.issueType)}
        eyebrow="Work Order"
        title={repair.title}
        subtitle={`${repair.repairCode} · ${
          repair.asset
            ? `${repair.asset.assetCode} · ${repair.asset.name}`
            : locationLabel
        }`}
        status={
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant={recoveryStageBadgeVariant(stage)}>
              {repairStatusProductLabel(repair.status)}
            </StatusBadge>
            <StatusBadge variant="neutral">
              {presentPmWorkOrderKindLabel(repair.workOrderKind)}
            </StatusBadge>
            <StatusBadge variant={priorityBadgeVariant(repair.priority)}>
              {repair.priority}
            </StatusBadge>
          </div>
        }
        actions={
          <Link
            href="/repairs"
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800"
          >
            All Work Orders
          </Link>
        }
        below={
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Location
              </dt>
              <dd className="mt-0.5 text-zinc-900">{locationLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Opened
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {formatIssueTimestamp(repair.requestedAt, tz)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Reported by
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {repair.reportedBy?.displayName ?? "Floor / system"}
              </dd>
            </div>
          </dl>
        }
      />

      <AppCard title="Why this repair exists" subtitle={repairSourceLabel(sourceKind)}>
        <div className="space-y-3 text-sm">
          {repair.sourceAssetIssue ? (
            <div data-testid="repair-linked-issue">
              <p className="font-medium text-zinc-900">
                Linked issue: {repair.sourceAssetIssue.summary}
              </p>
              <p className="mt-1 text-zinc-600">
                Issue status: {assetIssueStatusLabel(repair.sourceAssetIssue.status)} ·{" "}
                {repair.sourceAssetIssue.issueCode}
              </p>
              <Link
                href={`/asset-issues/${repair.sourceAssetIssue.id}`}
                className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold underline underline-offset-2"
              >
                View issue
              </Link>
            </div>
          ) : null}
          {repair.sourceOperationalRequest ? (
            <div data-testid="repair-linked-request">
              <p className="font-medium text-zinc-900">
                From maintenance request: {repair.sourceOperationalRequest.summary}
              </p>
              <p className="mt-1 text-zinc-600">
                {repair.sourceOperationalRequest.requestCode} ·{" "}
                {repair.sourceOperationalRequest.status}
              </p>
            </div>
          ) : null}
          {!repair.sourceAssetIssue && !repair.sourceOperationalRequest ? (
            <p className="text-zinc-700" data-testid="repair-direct-source">
              {sourceKind === "PREVENTIVE"
                ? "Preventive maintenance work — not from a reported Asset Issue."
                : "Direct repair — opened without a reported Asset Issue."}
            </p>
          ) : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Work description
            </p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-800">{repair.description}</p>
          </div>
        </div>
      </AppCard>

      {pmContext ? (
        <AppCard title="Preventive Maintenance" subtitle="Scheduled obligation for this Work Order">
          <dl className="grid gap-3 text-sm sm:grid-cols-2" data-testid="pm-work-order-context">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Plan</dt>
              <dd data-testid="pm-context-plan">{pmContext.planName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Scheduled</dt>
              <dd data-testid="pm-context-scheduled">
                {formatProjectedDateLabel(pmContext.scheduledDate, { includeYear: true })}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Occurrence</dt>
              <dd data-testid="pm-context-state">
                {pmContext.occurrenceStatus
                  ? presentPmOccurrenceStateLabel(
                      presentPmOccurrence({
                        status: pmContext.occurrenceStatus,
                        scheduledDate: pmContext.scheduledDate,
                        facilityToday: facilityCivilToday(facility.timezone),
                      }),
                    )
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Asset</dt>
              <dd>
                {repair.asset
                  ? `${repair.asset.assetCode} · ${repair.asset.name}`
                  : pmContext.assetName ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Procedure</dt>
              <dd data-testid="pm-context-procedure">{pmContext.procedureLabel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Category</dt>
              <dd>{pmContext.categoryLabel ?? repair.maintenanceCategory?.label ?? "—"}</dd>
            </div>
            {pmContext.requirementLabels && pmContext.requirementLabels.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Required evidence
                </dt>
                <dd data-testid="pm-context-requirements">{pmContext.requirementLabels.join(", ")}</dd>
              </div>
            ) : null}
          </dl>
          {hasAtLeastRole(session.role, "SUPERVISOR") ? (
            <p className="mt-3 text-sm">
              <Link
                href={`/preventive-maintenance/${pmContext.occurrenceId}`}
                className="font-medium underline underline-offset-2"
              >
                View occurrence
              </Link>
            </p>
          ) : null}
        </AppCard>
      ) : null}

      <AppCard
        title="Responsibility"
        subtitle="Who oversees the asset, who is obligated, and who is handling the work"
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2" data-testid="repair-responsibility">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Department
            </dt>
            <dd className="mt-0.5 text-zinc-900">
              {departmentDisplayLabel(responsibility.department)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Responsible maintainer
            </dt>
            <dd className="mt-0.5 text-zinc-900">
              {responsibleOrganizationDisplayLabel(responsibility.responsibleOrganization)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Preferred repair vendor
            </dt>
            <dd className="mt-0.5 text-zinc-900">
              {preferredRepairProviderDisplayLabel(responsibility.preferredRepairProvider)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Actual repair provider
            </dt>
            <dd className="mt-0.5 text-zinc-900" data-testid="repair-actual-provider">
              {repair.vendor?.name ?? "No external provider assigned"}
            </dd>
          </div>
          {repair.asset ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Asset condition
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {assetCondition?.conditionLabel ?? "—"}
                {" · "}
                <Link
                  href={`/assets/${repair.asset.id}`}
                  className="font-semibold underline underline-offset-2"
                >
                  View asset
                </Link>
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Asset
              </dt>
              <dd className="mt-0.5 text-zinc-900">No asset linked (legacy / unit work)</dd>
            </div>
          )}
        </dl>
      </AppCard>

      <AppCard title="Work status" subtitle={copy.typeLabel}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Status
            </dt>
            <dd className="mt-0.5 text-zinc-900">{repairStatusProductLabel(repair.status)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Assigned
            </dt>
            <dd className="mt-0.5 text-zinc-900">{assigneeName ?? "Unassigned"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Routing department
            </dt>
            <dd className="mt-0.5 text-zinc-900">
              {repair.responsibleDepartment?.name ?? "Unrouted"}
            </dd>
          </div>
          {repair.returnToServiceReady ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Return to service
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                Flagged ready — asset condition is still set separately on the asset.
              </dd>
            </div>
          ) : null}
        </dl>
      </AppCard>

      {recoveryGuidance ? (
        <RecoveryAssistantCard
          initialGuidance={recoveryGuidance}
          issueId={repair.id}
          departmentKey={deptNav.activeOperationalDepartmentKey ?? "DIETARY"}
          aiEnabled={aiEnabled}
          canRefresh={canRefreshRecovery}
        />
      ) : null}

      <AppCard title="Updates" subtitle="Progress notes on this repair">
        <ol className="space-y-3" data-testid="repair-history">
          <li className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-zinc-900">Repair opened</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {formatIssueTimestamp(repair.createdAt, tz)}
              {repair.reportedBy ? ` · ${repair.reportedBy.displayName}` : ""}
            </p>
          </li>
          {repair.updates.map((update) => (
            <li
              key={update.id}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm"
            >
              <p className="whitespace-pre-wrap text-zinc-900">{update.updateText}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {formatIssueTimestamp(update.updatedAt, tz)}
                {update.updatedBy ? ` · ${update.updatedBy.displayName}` : ""}
                {update.statusAfterUpdate
                  ? ` · → ${repairStatusProductLabel(update.statusAfterUpdate)}`
                  : ""}
              </p>
            </li>
          ))}
        </ol>
      </AppCard>

      {linkedIssue ? (
        <AppCard title="Why" subtitle="Linked Issue remains the condition record">
          <p className="text-sm">
            <Link href={`/asset-issues/${linkedIssue.id}`} className="underline underline-offset-2">
              {linkedIssue.issueCode} · {linkedIssue.summary} · {linkedIssue.status}
            </Link>
          </p>
        </AppCard>
      ) : null}

      {repair.procedureVersion ? (
        <AppCard title="How" subtitle="Pinned Procedure version">
          <p className="text-sm">
            {repair.procedureVersion.title} · v{repair.procedureVersion.version} ·{" "}
            {repair.procedureVersion.status}
          </p>
        </AppCard>
      ) : null}

      {repair.evidenceLinks.length > 0 ? (
        <AppCard title="Associated evidence" subtitle="Incidental Records linked to this Work Order">
          <ul className="space-y-1 text-sm">
            {repair.evidenceLinks.map((link) => (
              <li key={link.id}>
                {link.evidenceRecord.templateName} · {link.evidenceRecord.status}
              </li>
            ))}
          </ul>
        </AppCard>
      ) : null}

      <AppCard
        title="Completion / recovery"
        subtitle="Completing a Work Order does not resolve the Issue, close the Request, or restore the Asset"
      >
        <div className="space-y-3 text-sm" data-testid="repair-completion-guidance">
          {completed ? (
            <div
              className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-800"
              data-testid="wo-post-completion"
            >
              <p>Work Order completed.</p>
              <p>
                Issue:{" "}
                {linkedIssue
                  ? linkedIssue.status === "RESOLVED" || linkedIssue.status === "CLOSED"
                    ? "Resolved"
                    : "Still OPEN"
                  : "None"}
              </p>
              {repair.asset ? (
                <p>
                  Asset: {assetCondition?.conditionLabel ?? repair.asset.status}
                </p>
              ) : (
                <p>Location-only work. No Asset condition to update.</p>
              )}
              <div className="flex flex-wrap gap-3">
                {linkedIssue &&
                linkedIssue.status !== "RESOLVED" &&
                linkedIssue.status !== "CLOSED" &&
                linkedIssue.status !== "CANCELLED" ? (
                  <Link
                    href={`/asset-issues/${linkedIssue.id}`}
                    className="font-semibold underline underline-offset-2"
                    data-testid="wo-resolve-issue-link"
                  >
                    Resolve Issue
                  </Link>
                ) : null}
                {repair.asset ? (
                  <Link
                    href={`/assets/${repair.asset.id}`}
                    className="font-semibold underline underline-offset-2"
                    data-testid="wo-update-asset-link"
                  >
                    Update Asset condition
                  </Link>
                ) : null}
                {linkedIssue ? (
                  <Link
                    href={`/asset-issues/${linkedIssue.id}`}
                    className="font-semibold underline underline-offset-2"
                    data-testid="wo-create-another-link"
                  >
                    Create another Work Order
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-zinc-700">
              When work finishes, complete this Work Order. Issue, Request, and Asset stay separate
              until someone explicitly updates them.
            </p>
          )}
          {assetStillOos ? (
            <p
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"
              data-testid="repair-rts-reminder"
            >
              Work Order completed. Asset is still{" "}
              {assetCondition?.conditionLabel ?? "Out of service"}.
            </p>
          ) : null}
        </div>
      </AppCard>

      {plantOrAssetOps ? (
        <>
        <AppCard title="Execution" subtitle="Start, hold, resume, or update">
          <WorkOrderExecutionPanel
            repairId={repair.id}
            departmentId={
              repair.responsibleDepartmentId ?? deptNav.activeDepartmentId ?? repair.unit.facilityId
            }
            issueId={linkedIssue?.id ?? null}
            status={repair.status}
            canExecute={canMutate}
            canAssign={canAssign}
            assignedEmployeeId={repair.assignedEmployeeId}
            employees={employees.map((employee) => ({
              id: employee.id,
              name: `${employee.firstName} ${employee.lastName}`.trim(),
            }))}
          />
        </AppCard>
        <AppCard
          title="Closeout"
          subtitle="Work performed, labor, parts, required evidence, and recorded material & vendor expense"
        >
          <WorkOrderCloseoutPanel
            repairId={repair.id}
            departmentId={closeoutDepartmentId}
            issueId={linkedIssue?.id ?? null}
            status={repair.status}
            completed={completed}
            canExecute={canMutate}
            canSupervise={canAssign}
            hasAsset={Boolean(repair.assetId)}
            workPerformed={repair.workPerformed ?? ""}
            labor={repair.laborEntries.map((entry) => ({
              id: entry.id,
              minutes: entry.minutes,
              employeeId: entry.employeeId,
              employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`.trim(),
            }))}
            laborTotalMinutes={repair.laborEntries.reduce((sum, entry) => sum + entry.minutes, 0)}
            parts={repair.partsUsed.map((part) => ({
              id: part.id,
              description: part.description,
              partNumber: part.partNumber,
              quantity: part.quantity.toString(),
              lineCost: formatRecordedExpense(part.lineCost),
            }))}
            requirements={repair.recordRequirements.map((requirement) => ({
              id: requirement.id,
              templateName: requirement.templateName,
              templateVersion: requirement.templateVersion,
              status: requirement.status,
              waiveReason: requirement.waiveReason,
              satisfiedStatus: requirement.satisfiedByRecord?.status ?? null,
              outOfStandard: requirement.satisfiedByRecord?.outOfStandard ?? false,
            }))}
            templates={publishedTemplates}
            vendors={vendors}
            employees={employees.map((employee) => ({
              id: employee.id,
              name: `${employee.firstName} ${employee.lastName}`.trim(),
            }))}
            vendorId={repair.vendorId}
            vendorName={repair.vendor?.name ?? null}
            externalCost={repair.externalCost?.toFixed(2) ?? null}
            externalCostNote={repair.externalCostNote}
            recordedExpense={formatRecordedExpense(
              closeoutExpense.recordedMaterialVendorExpense,
            )}
            assetReview={repair.assetConditionReview}
            missing={closeoutMissing}
          />
        </AppCard>
        </>
      ) : (
      <AppCard title="Repair actions" subtitle="Assign, update, or complete this repair">
        <IssueDetailActions
          issueId={repair.id}
          status={repair.status}
          assignedEmployeeId={repair.assignedEmployeeId}
          responsibleDepartmentId={repair.responsibleDepartmentId}
          employees={employees.map((employee) => ({
            id: employee.id,
            name: `${employee.firstName} ${employee.lastName}`.trim(),
          }))}
          departments={departments}
          canMutate={canMutate}
          terminology={assetOpsEnabled ? "repair" : "issue"}
        />
      </AppCard>
      )}

      <AppCard
        title="Photos"
        subtitle="Pictures attached when this repair was opened, or added later for context"
      >
        <div className="space-y-4" data-testid="repair-photos">
          <PhotoGallery
            photos={repair.attachments}
            emptyLabel="No photos attached."
            canRemove={canMutate}
            removeAction={removeRepairPhotoAction}
            removeHiddenFields={{ repairId: repair.id }}
          />
          {canMutate ? (
            <form
              action={addRepairPhotosAction}
              className="space-y-3"
              data-testid="repair-photo-upload"
            >
              <input type="hidden" name="repairId" value={repair.id} />
              <PhotoFileField
                multiple
                maxCount={MAX_REPAIR_PHOTOS_PER_SUBMIT}
                label="Add photos"
                testId="repair-detail-photo-input"
              />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Upload photos
              </button>
            </form>
          ) : null}
        </div>
      </AppCard>

      {issueKnowledge.count > 0 ? (
        <AppCard title="Guidance" subtitle="Published help linked to this location or equipment">
          <ContextualKnowledgePanel
            articles={issueKnowledge.articles}
            title="Help & instructions"
          />
        </AppCard>
      ) : null}

      <AppCard title="Related context">
        <ul className="space-y-2 text-sm">
          <li>
            <Link
              href={`/unit/${repair.unit.id}`}
              className="font-medium text-zinc-900 underline hover:text-zinc-600"
            >
              Unit workspace · {repair.unit.name}
            </Link>
          </li>
          {projectedTask ? (
            <li className="text-zinc-700">
              Task projection · {projectedTask.status} ({projectedTask.title})
            </li>
          ) : null}
          <li className="text-xs text-zinc-500">
            Stage: {recoveryStageLabel(stage)}
          </li>
        </ul>
      </AppCard>
    </section>
  );
}
