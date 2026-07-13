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
import { getSession } from "@/lib/auth";
import { departmentFilterIdsForSession } from "@/lib/department-scope";
import { isAiRecoveryAssistantEnabled } from "@/lib/feature-flags";
import { loadContextualKnowledge } from "@/lib/knowledge/contextual";
import { prisma } from "@/lib/prisma";
import { formatIssueTimestamp } from "@/lib/work/issues/format-issue-time";
import {
  getIssueCopy,
  issueDetailPath,
  issueTypeIconKey,
  mapRepairStatusToRecoveryStage,
  priorityBadgeVariant,
  recoveryStageBadgeVariant,
  recoveryStageLabel,
  resolveIssueImpactSummary,
  resolveIssueNextAction,
  resolveIssueRecoveryStatePhrase,
} from "@/lib/work/issues/issue-copy";

type IssueDetailPageProps = {
  params: Promise<{ issueId: string }>;
};

export default async function IssueDetailPage({ params }: IssueDetailPageProps) {
  noStore();
  const { issueId } = await params;

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

  const issue = await prisma.repair.findFirst({
    where: { id: issueId, unit: { facilityId: session.facilityId } },
    include: {
      unit: { select: { id: true, name: true, facilityId: true } },
      asset: { select: { id: true, assetCode: true, name: true, status: true, criticality: true } },
      vendor: { select: { id: true, name: true } },
      reportedBy: { select: { id: true, displayName: true } },
      assignedEmployee: { select: { id: true, firstName: true, lastName: true } },
      requestingDepartment: { select: { id: true, name: true, key: true } },
      responsibleDepartment: { select: { id: true, name: true, key: true } },
      updates: {
        orderBy: { updatedAt: "asc" },
        include: {
          updatedBy: { select: { displayName: true } },
        },
      },
    },
  });

  if (!issue) {
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
        sourceId: issue.id,
      },
      select: { id: true, status: true, title: true },
    }),
    departmentFilterIdsForSession(session),
  ]);

  const issueKnowledge = await loadContextualKnowledge({
    facilityId: session.facilityId,
    viewerDepartmentIds,
    unitId: issue.unitId,
    assetId: issue.assetId,
    includeFacilityWideReference: true,
    limit: 8,
  });

  const copy = getIssueCopy(issue.issueType);
  const stage = mapRepairStatusToRecoveryStage({
    status: issue.status,
    assignedEmployeeId: issue.assignedEmployeeId,
  });
  const assigneeName = issue.assignedEmployee
    ? `${issue.assignedEmployee.firstName} ${issue.assignedEmployee.lastName}`.trim()
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
          issueId: issue.id,
          viewerDepartmentIds,
          departmentKey: deptNav.activeOperationalDepartmentKey,
          allowProvider: false,
        })
      : null;

  return (
    <section className="mx-auto max-w-4xl space-y-6" data-testid="issue-detail">
      <PageHeader
        icon={issueTypeIconKey(issue.issueType)}
        eyebrow={copy.typeLabel}
        title={issue.title}
        subtitle={`${issue.repairCode} · ${issue.unit.name}`}
        status={
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant={recoveryStageBadgeVariant(stage)}>
              {recoveryStageLabel(stage)}
            </StatusBadge>
            <StatusBadge variant={priorityBadgeVariant(issue.priority)}>
              {issue.priority}
            </StatusBadge>
          </div>
        }
        actions={
          <Link
            href="/repairs"
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800"
          >
            All issues
          </Link>
        }
        below={
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Location
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                <Link href={`/unit/${issue.unit.id}`} className="underline hover:text-zinc-600">
                  {issue.unit.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Reported
              </dt>
              <dd className="mt-0.5 text-zinc-900">{formatIssueTimestamp(issue.createdAt, tz)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Reporter
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {issue.reportedBy?.displayName ?? "Floor / system"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Assigned
              </dt>
              <dd className="mt-0.5 text-zinc-900">{assigneeName ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Department
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {issue.responsibleDepartment?.name ?? "Unrouted"}
              </dd>
            </div>
            {issue.asset ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Related asset
                </dt>
                <dd className="mt-0.5 text-zinc-900">
                  <Link href="/assets" className="underline hover:text-zinc-600">
                    {issue.asset.assetCode} · {issue.asset.name}
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        }
      />

      <AppCard title="Operational summary" subtitle={copy.typeLabel}>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              What happened
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-zinc-800">{issue.description}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Current impact
            </dt>
            <dd className="mt-1 text-zinc-800">
              {resolveIssueImpactSummary({
                issueType: issue.issueType,
                priority: issue.priority,
                status: issue.status,
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Recovery state
            </dt>
            <dd className="mt-1 text-zinc-800">
              {resolveIssueRecoveryStatePhrase({
                issueType: issue.issueType,
                status: issue.status,
                assignedEmployeeId: issue.assignedEmployeeId,
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Next action
            </dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {resolveIssueNextAction({
                issueType: issue.issueType,
                status: issue.status,
                assignedEmployeeId: issue.assignedEmployeeId,
              })}
            </dd>
          </div>
        </dl>
      </AppCard>

      {recoveryGuidance ? (
        <RecoveryAssistantCard
          initialGuidance={recoveryGuidance}
          issueId={issue.id}
          departmentKey={deptNav.activeOperationalDepartmentKey ?? "DIETARY"}
          aiEnabled={aiEnabled}
          canRefresh={canRefreshRecovery}
        />
      ) : null}

      <AppCard title="Progress history" subtitle="Append-only recovery timeline">
        <ol className="space-y-3" data-testid="issue-history">
          <li className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-zinc-900">{copy.reportedPhrase}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {formatIssueTimestamp(issue.createdAt, tz)}
              {issue.reportedBy ? ` · ${issue.reportedBy.displayName}` : ""}
            </p>
          </li>
          {issue.updates.map((update) => (
            <li
              key={update.id}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm"
            >
              <p className="whitespace-pre-wrap text-zinc-900">{update.updateText}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {formatIssueTimestamp(update.updatedAt, tz)}
                {update.updatedBy ? ` · ${update.updatedBy.displayName}` : ""}
                {update.statusAfterUpdate ? ` · → ${update.statusAfterUpdate}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </AppCard>

      <AppCard title="Recovery actions" subtitle="Assign, update, resolve, or reopen">
        <IssueDetailActions
          issueId={issue.id}
          status={issue.status}
          assignedEmployeeId={issue.assignedEmployeeId}
          responsibleDepartmentId={issue.responsibleDepartmentId}
          employees={employees.map((employee) => ({
            id: employee.id,
            name: `${employee.firstName} ${employee.lastName}`.trim(),
          }))}
          departments={departments}
          canMutate={canMutate}
        />
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
              href={`/unit/${issue.unit.id}`}
              className="font-medium text-zinc-900 underline hover:text-zinc-600"
            >
              Unit workspace · {issue.unit.name}
            </Link>
          </li>
          {issue.asset ? (
            <li>
              <Link href="/assets" className="font-medium text-zinc-900 underline hover:text-zinc-600">
                Asset · {issue.asset.assetCode} {issue.asset.name}
              </Link>
            </li>
          ) : null}
          {issue.vendor ? (
            <li className="text-zinc-700">Vendor · {issue.vendor.name}</li>
          ) : null}
          {projectedTask ? (
            <li className="text-zinc-700">
              Task projection · {projectedTask.status} ({projectedTask.title})
            </li>
          ) : (
            <li className="text-zinc-500">
              No Task projection yet (enable TASK_SYNC or wait for next sync).
            </li>
          )}
          <li>
            <Link href="/repairs" className="font-medium text-zinc-900 underline hover:text-zinc-600">
              Issues / repairs board
            </Link>
          </li>
          <li className="text-xs text-zinc-500">Canonical path: {issueDetailPath(issue.id)}</li>
        </ul>
      </AppCard>
    </section>
  );
}
