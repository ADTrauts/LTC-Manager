import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { assetCriticalityLabel } from "@/lib/asset-criticality";
import {
  buildOperationalTimeContext,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { loadUnitReadinessBatch } from "@/lib/readiness";
import { readinessStateDisplayLabel } from "@/lib/readiness";
import { loadContextualKnowledge } from "@/lib/knowledge/contextual";
import {
  issueDetailPath,
  mapRepairStatusToRecoveryStage,
  resolveIssueImpactSummary,
} from "@/lib/work/issues/issue-copy";
import {
  staffingPath,
  todaysWorkCoveragePath,
  todaysWorkHandoffsPath,
  unitWorkspacePath,
} from "@/lib/ai/operational-snapshot/source-paths";
import type { SnapshotReadinessState } from "@/lib/ai/operational-snapshot/types";

import {
  enforceRecoverySnapshotSize,
  hashRecoverySnapshot,
  sanitizePlainText,
  sanitizeRecoverySnapshot,
} from "./sanitize";
import type { RecoveryAvailableAction, RecoverySnapshot } from "./types";

export type BuildRecoverySnapshotInput = {
  facilityId: string;
  issueId: string;
  viewerDepartmentIds: string[] | null;
  departmentKey?: OperationalDepartmentKey | null;
  now?: Date;
  maxSnapshotChars?: number;
};

function toSnapshotState(state: string): SnapshotReadinessState {
  if (state === "blocked") return "needs_attention";
  if (state === "in_progress") return "in_progress";
  return "ready";
}

function knowledgePath(issueId: string, articleId: string): string {
  return `${issueDetailPath(issueId)}#guidance-${articleId}`;
}

function buildAvailableActions(input: {
  issueId: string;
  unitId: string;
  assigned: boolean;
  stage: string;
}): RecoveryAvailableAction[] {
  const actions: RecoveryAvailableAction[] = [
    {
      key: "view_issue",
      label: "Review issue record",
      sourcePath: issueDetailPath(input.issueId),
    },
    {
      key: "unit_workspace",
      label: "Open unit workspace",
      sourcePath: unitWorkspacePath(input.unitId),
    },
    {
      key: "handoffs",
      label: "Today's Work handoffs",
      sourcePath: todaysWorkHandoffsPath(),
    },
    {
      key: "coverage",
      label: "Coverage list",
      sourcePath: todaysWorkCoveragePath(),
    },
    {
      key: "staffing",
      label: "Staffing",
      sourcePath: staffingPath(),
    },
    {
      key: "assets",
      label: "Assets",
      sourcePath: "/assets",
    },
  ];
  if (!input.assigned && input.stage !== "RESOLVED") {
    actions.unshift({
      key: "assign_owner",
      label: "Assign an owner (human action required)",
      sourcePath: issueDetailPath(input.issueId),
    });
  }
  return actions;
}

/**
 * Builds a privacy-minimized recovery snapshot from authoritative loaders.
 * Read-only — never mutates issue/task/readiness records.
 */
export async function buildRecoverySnapshot(
  input: BuildRecoverySnapshotInput,
): Promise<{ snapshot: RecoverySnapshot; snapshotHash: string }> {
  const now = input.now ?? new Date();
  const department = (input.departmentKey ?? "DIETARY") as OperationalDepartmentKey;

  const issue = await prisma.repair.findFirst({
    where: { id: input.issueId, unit: { facilityId: input.facilityId } },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      issueType: true,
      createdAt: true,
      dueAt: true,
      updatedAt: true,
      assignedEmployeeId: true,
      unitId: true,
      assetId: true,
      unit: { select: { id: true, name: true } },
      asset: {
        select: {
          id: true,
          name: true,
          status: true,
          criticality: true,
        },
      },
      updates: {
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          updateText: true,
          updatedAt: true,
          statusAfterUpdate: true,
        },
      },
    },
  });

  if (!issue) {
    throw new Error("Issue not found for facility.");
  }

  const facilityTimezone = await loadFacilityTimezone(prisma, input.facilityId);
  const timeCtx = buildOperationalTimeContext({ now, facilityTimezone });

  const [readinessBatch, knowledge, relatedOpen, relatedSupply] = await Promise.all([
    loadUnitReadinessBatch(input.facilityId, {
      activeDepartmentKey: department,
      facilityTimezone,
      now,
    }),
    loadContextualKnowledge({
      facilityId: input.facilityId,
      viewerDepartmentIds: input.viewerDepartmentIds,
      unitId: issue.unitId,
      assetId: issue.assetId,
      includeFacilityWideReference: true,
      limit: 6,
    }),
    prisma.repair.count({
      where: {
        status: { not: "CLOSED" },
        unit: { facilityId: input.facilityId },
        id: { not: issue.id },
        unitId: issue.unitId,
      },
    }),
    prisma.repair.count({
      where: {
        status: { not: "CLOSED" },
        issueType: "SUPPLY_SHORT",
        unit: { facilityId: input.facilityId },
        unitId: issue.unitId,
      },
    }),
  ]);

  const unitReadiness = readinessBatch.byUnitId.get(issue.unitId);
  const readinessState = toSnapshotState(unitReadiness?.state ?? "ready");
  const stage = mapRepairStatusToRecoveryStage({
    status: issue.status,
    assignedEmployeeId: issue.assignedEmployeeId,
  });

  const impactSummary = resolveIssueImpactSummary({
    issueType: issue.issueType,
    priority: issue.priority,
    status: issue.status,
  });

  const affectedSignals: string[] = [impactSummary];
  if (issue.priority === "URGENT" || issue.priority === "HIGH") {
    affectedSignals.push(`${issue.priority.toLowerCase()} priority`);
  }
  if (!issue.assignedEmployeeId && stage !== "RESOLVED") {
    affectedSignals.push("unassigned");
  }
  if (readinessState === "needs_attention") {
    affectedSignals.push("location Needs Attention");
  }

  const availableActions = buildAvailableActions({
    issueId: issue.id,
    unitId: issue.unitId,
    assigned: Boolean(issue.assignedEmployeeId),
    stage,
  });

  const knowledgeItems = knowledge.articles.map((article) => ({
    title: article.title,
    summary: sanitizePlainText(article.summary ?? article.title, 220),
    category: article.category,
    sourcePath: knowledgePath(issue.id, article.id),
  }));

  const raw: RecoverySnapshot = {
    generatedAt: now.toISOString(),
    facilityLocalTime: `${timeCtx.facilityLocalDate} ${String(timeCtx.facilityLocal.hour).padStart(2, "0")}:${String(timeCtx.facilityLocal.minute).padStart(2, "0")}`,
    timezone: facilityTimezone,
    serviceDate: timeCtx.facilityLocalDate,
    department,
    activeOperation: {
      label: readinessBatch.operationContext.serviceLabel,
      phase: readinessBatch.operationContext.phase,
      scheduledTime: readinessBatch.operationContext.scheduledTimeLabel,
    },
    issue: {
      id: issue.id,
      issueType: issue.issueType,
      title: issue.title,
      sanitizedDescription: issue.description,
      priority: issue.priority,
      recoveryStage: stage,
      reportedAt: issue.createdAt.toISOString(),
      dueAt: issue.dueAt?.toISOString() ?? null,
      assigned: Boolean(issue.assignedEmployeeId),
      relatedAsset: issue.asset
        ? {
            id: issue.asset.id,
            name: issue.asset.name,
            status: issue.asset.status,
            criticality: assetCriticalityLabel(issue.asset.criticality),
          }
        : null,
      location: {
        id: issue.unit.id,
        name: issue.unit.name,
        readinessState,
        readinessReason:
          unitReadiness?.reason ??
          (readinessState === "ready"
            ? `Ready for ${readinessBatch.operationContext.mealLabel.toLowerCase()}`
            : readinessStateDisplayLabel(
                unitReadiness?.state === "blocked"
                  ? "blocked"
                  : unitReadiness?.state === "in_progress"
                    ? "in_progress"
                    : "ready",
              )),
      },
      recentUpdates: [...issue.updates]
        .reverse()
        .map((update) => ({
          timestamp: update.updatedAt.toISOString(),
          sanitizedSummary: update.updateText,
          status: update.statusAfterUpdate,
        })),
    },
    operationalImpact: {
      currentServiceAtRisk:
        issue.priority === "URGENT" ||
        issue.priority === "HIGH" ||
        readinessState === "needs_attention",
      currentOperationLabel: readinessBatch.operationContext.serviceLabel,
      affectedSignals,
      staffingState:
        readinessState === "needs_attention" && /staff|server|coverage/i.test(unitReadiness?.reason ?? "")
          ? "coverage concern at location"
          : "no staffing signal from readiness",
      relatedSupplyShorts: relatedSupply,
      relatedOpenIssues: relatedOpen,
    },
    knowledge: knowledgeItems,
    availableActions,
    allowedSourcePaths: Array.from(
      new Set([
        issueDetailPath(issue.id),
        unitWorkspacePath(issue.unitId),
        todaysWorkHandoffsPath(),
        todaysWorkCoveragePath(),
        staffingPath(),
        "/assets",
        "/repairs",
        ...knowledgeItems.map((k) => k.sourcePath),
        ...availableActions.map((a) => a.sourcePath),
      ]),
    ),
  };

  const snapshot = enforceRecoverySnapshotSize(
    sanitizeRecoverySnapshot(raw),
    input.maxSnapshotChars ?? 12_000,
  );
  return { snapshot, snapshotHash: hashRecoverySnapshot(snapshot) };
}
