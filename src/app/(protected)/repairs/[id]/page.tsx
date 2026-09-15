import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { IssueDetailActions } from "@/components/issues/issue-detail-actions";
import { RecoveryAssistantCard } from "@/components/issues/recovery-assistant-card";
import { ContextualKnowledgePanel } from "@/components/knowledge/contextual-knowledge-panel";
import { AppCard, PageHeader, StatusBadge } from "@/components/design-system";
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
} from "@/lib/asset-operations";
import { getSession } from "@/lib/auth";
import { departmentFilterIdsForSession } from "@/lib/department-scope";
import { isAiRecoveryAssistantEnabled, isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import { loadContextualKnowledge } from "@/lib/knowledge/contextual";
import { prisma } from "@/lib/prisma";
import { formatIssueTimestamp } from "@/lib/work/issues/format-issue-time";
import {
  getIssueCopy,
  issueTypeIconKey,
  mapRepairStatusToRecoveryStage,
  priorityBadgeVariant,
  recoveryStageBadgeVariant,
  recoveryStageLabel,
} from "@/lib/work/issues/issue-copy";

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
      sourceOperationalRequest: {
        select: { id: true, requestCode: true, summary: true, status: true },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, originalFilename: true, createdAt: true },
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
    prisma.department.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
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
  const canMutate = hasAtLeastRole(session.role, "STAFF");
  const tz = facility.timezone;
  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
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
  const responsibility = projectAssetResponsibility({
    department: repair.asset?.department ?? repair.responsibleDepartment,
    responsibleOrganization: repair.asset?.responsibleOrganization ?? null,
    preferredRepairProvider: repair.asset?.vendor ?? null,
  });
  const locationLabel = formatAssetLocationLabel({
    unitName: repair.unit.name,
    spaceName: repair.asset?.space?.name ?? null,
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
        eyebrow="Repair"
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
            All repairs
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

      <AppCard
        title="Completion / return to service"
        subtitle="Completing a repair does not resolve the Asset Issue or set the asset Operational"
      >
        <div className="space-y-3 text-sm" data-testid="repair-completion-guidance">
          {completed ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-800">
              Repair completed
              {repair.completedAt
                ? ` · ${formatIssueTimestamp(repair.completedAt, tz)}`
                : ""}
              {repair.resolution ? ` · ${repair.resolution}` : ""}
            </p>
          ) : (
            <p className="text-zinc-700">
              When work finishes, mark the repair complete. Asset condition and any linked issue
              stay separate.
            </p>
          )}
          {assetStillOos ? (
            <p
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"
              data-testid="repair-rts-reminder"
            >
              Repair completed. Asset is still{" "}
              {assetCondition?.conditionLabel ?? "Out of service"}. Update condition on the asset
              when it is verified ready for use.
            </p>
          ) : null}
          {repair.sourceAssetIssue &&
          completed &&
          repair.sourceAssetIssue.status !== "RESOLVED" &&
          repair.sourceAssetIssue.status !== "CLOSED" &&
          repair.sourceAssetIssue.status !== "CANCELLED" ? (
            <p>
              <Link
                href={`/asset-issues/${repair.sourceAssetIssue.id}`}
                className="inline-flex min-h-10 items-center font-semibold underline underline-offset-2"
              >
                Review linked issue
              </Link>
            </p>
          ) : null}
          {repair.asset ? (
            <p>
              <Link
                href={`/assets/${repair.asset.id}`}
                className="inline-flex min-h-10 items-center font-semibold underline underline-offset-2"
              >
                Open asset condition
              </Link>
            </p>
          ) : null}
        </div>
      </AppCard>

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

      {repair.attachments.length > 0 ? (
        <AppCard title="Attachments">
          <ul className="space-y-1 text-sm">
            {repair.attachments.map((file) => (
              <li key={file.id} className="text-zinc-800">
                {file.originalFilename}
                <span className="text-xs text-zinc-500">
                  {" "}
                  · {formatIssueTimestamp(file.createdAt, tz)}
                </span>
              </li>
            ))}
          </ul>
        </AppCard>
      ) : null}

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
