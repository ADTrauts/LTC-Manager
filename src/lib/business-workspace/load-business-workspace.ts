import type { AppRole } from "@/lib/access";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { buildOperationalTimeContext, loadFacilityTimezone } from "@/lib/operational-time";
import { loadOperationsCenterDashboard } from "@/lib/operations-center";
import { prisma } from "@/lib/prisma";
import { loadUnitReadinessBatch, summarizeReadiness } from "@/lib/readiness";
import type { UnitReadiness } from "@/lib/readiness";
import type { ReadinessProfileKey } from "@/lib/readiness/profiles";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";

import type {
  BusinessWorkspaceData,
  BusinessWorkspaceView,
  WorkspaceActivityItem,
  WorkspaceDepartmentHealth,
  WorkspacePriorityCard,
} from "./types";
import {
  greetingForLocalHour,
  healthBadgeForTone,
  healthToneFromReadiness,
} from "./workspace-layout";
import { canAccessBusinessWorkspace, resolveWorkspaceSections } from "./workspace-permissions";

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

function summarizeProfile(
  items: UnitReadiness[],
  profileKey: ReadinessProfileKey,
): { blocked: number; inProgress: number; total: number; ready: number } {
  return summarizeReadiness(items.filter((item) => item.profileKey === profileKey));
}

function buildPriorities(input: {
  operationLabel: string;
  staffingGaps: number;
  openIssues: number;
  urgentIssues: number;
  readinessBlocked: number;
  inspectionsDue: number;
  callDownOpen: number;
}): WorkspacePriorityCard[] {
  const cards: WorkspacePriorityCard[] = [
    {
      id: "service",
      title: input.operationLabel,
      detail: "Current meal service focus",
      href: "/dashboard",
      tone: "in_progress",
    },
  ];

  if (input.staffingGaps > 0) {
    cards.push({
      id: "staffing",
      title: `${input.staffingGaps} Staffing Gap${input.staffingGaps === 1 ? "" : "s"}`,
      detail: "Locations missing expected coverage",
      href: "/today/coverage",
      tone: "warning",
    });
  }

  if (input.inspectionsDue > 0) {
    cards.push({
      id: "inspections",
      title: `${input.inspectionsDue} Inspection${input.inspectionsDue === 1 ? "" : "s"} Due`,
      detail: "Scheduled inspection work due soon",
      href: "/today/handoffs",
      tone: "warning",
    });
  }

  if (input.openIssues > 0) {
    cards.push({
      id: "issues",
      title: `${input.openIssues} Open Issue${input.openIssues === 1 ? "" : "s"}`,
      detail:
        input.urgentIssues > 0
          ? `${input.urgentIssues} urgent`
          : "Active repairs and issues",
      href: "/issues",
      tone: input.urgentIssues > 0 ? "blocked" : "warning",
    });
  }

  if (input.readinessBlocked > 0) {
    cards.push({
      id: "readiness",
      title: `${input.readinessBlocked} Location${input.readinessBlocked === 1 ? "" : "s"} Need Attention`,
      detail: "Readiness blocked on today's service",
      href: "/today/walk",
      tone: "blocked",
    });
  }

  if (input.callDownOpen > 0 && cards.length < 5) {
    cards.push({
      id: "calldowns",
      title: `${input.callDownOpen} Call-down${input.callDownOpen === 1 ? "" : "s"} Open`,
      detail: "Coverage call-downs still open",
      href: "/today/coverage",
      tone: "warning",
    });
  }

  return cards.slice(0, 5);
}

function buildDepartmentHealth(items: UnitReadiness[]): WorkspaceDepartmentHealth[] {
  const defs: Array<{ key: ReadinessProfileKey; label: string }> = [
    { key: "DIETARY", label: "Dietary" },
    { key: "EVS", label: "EVS" },
    { key: "PLANT", label: "Plant" },
  ];

  return defs.map((def) => {
    const summary = summarizeProfile(items, def.key);
    const tone = healthToneFromReadiness(summary);
    return {
      key: def.key,
      label: def.label,
      tone,
      badge: healthBadgeForTone(tone),
      summary:
        summary.total === 0
          ? "No locations in scope"
          : `${summary.ready} ready · ${summary.inProgress} in progress · ${summary.blocked} need attention`,
    };
  });
}

async function loadRecentActivity(facilityId: string): Promise<WorkspaceActivityItem[]> {
  const [repairs, inspections, articles] = await Promise.all([
    prisma.repair.findMany({
      where: { unit: { facilityId } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        unit: { select: { name: true } },
      },
    }),
    prisma.inspectionSubmission.findMany({
      where: { facilityId },
      orderBy: { submittedAt: "desc" },
      take: 4,
      select: {
        id: true,
        result: true,
        submittedAt: true,
        definition: { select: { name: true } },
        unit: { select: { name: true } },
      },
    }),
    prisma.knowledgeArticle.findMany({
      where: { facilityId, status: "PUBLISHED" },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, title: true, updatedAt: true, category: true },
    }),
  ]);

  const items: WorkspaceActivityItem[] = [];

  for (const row of inspections) {
    items.push({
      id: `insp-${row.id}`,
      title: row.definition.name,
      meta: `${row.unit?.name ?? "Facility"} · ${row.result} · ${row.submittedAt.toISOString().slice(0, 10)}`,
      href: "/admin/inspections",
      kind: "inspection",
    });
  }

  for (const row of repairs) {
    items.push({
      id: `issue-${row.id}`,
      title: row.title,
      meta: `${row.unit.name} · ${row.status} · ${row.createdAt.toISOString().slice(0, 10)}`,
      href: issueDetailPath(row.id),
      kind: "issue",
    });
  }

  for (const row of articles) {
    items.push({
      id: `know-${row.id}`,
      title: row.title,
      meta: `${row.category} · updated ${row.updatedAt.toISOString().slice(0, 10)}`,
      href: "/admin/knowledge",
      kind: "knowledge",
    });
  }

  return items.slice(0, 8);
}

export type LoadBusinessWorkspaceInput = {
  facilityId: string;
  facilityName: string;
  userDisplayName: string;
  role: AppRole;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentName?: string | null;
};

/**
 * Compose Business Workspace from existing operational loaders.
 * Major OC + readiness batches once; recent activity uses existing list query shapes.
 */
export async function loadBusinessWorkspace(
  input: LoadBusinessWorkspaceInput,
): Promise<BusinessWorkspaceView | null> {
  if (!canAccessBusinessWorkspace(input.role)) {
    return null;
  }

  const facilityTimezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalTime = buildOperationalTimeContext({ now: new Date(), facilityTimezone });
  const now = new Date();
  const dayEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [oc, readiness, recentActivity, inspectionsDue] = await Promise.all([
    loadOperationsCenterDashboard(input.facilityId, {
      activeDepartmentKey: input.activeDepartmentKey,
    }),
    loadUnitReadinessBatch(input.facilityId, {
      activeDepartmentKey: null,
      facilityTimezone,
      now,
    }),
    loadRecentActivity(input.facilityId),
    prisma.inspectionOccurrence.count({
      where: {
        facilityId: input.facilityId,
        status: "OPEN",
        dueAt: { lte: dayEnd },
      },
    }).catch(() => 0),
  ]);

  const operationLabel = `${oc.operationContext.serviceLabel} — ${oc.operationContext.phase}`;
  const callDownOpen = oc.callDowns?.summary.open ?? 0;
  const staffingGaps = oc.unitsMissingStaffing.length;

  const data: BusinessWorkspaceData = {
    header: {
      greeting: greetingForLocalHour(
        operationalTime.facilityLocal.hour,
        firstName(input.userDisplayName),
      ),
      facilityName: input.facilityName,
      departmentLabel: input.activeDepartmentName?.trim() || "All departments",
      operation: oc.operationContext,
    },
    priorities: buildPriorities({
      operationLabel,
      staffingGaps,
      openIssues: oc.openRepairCount,
      urgentIssues: oc.urgentRepairCount,
      readinessBlocked: oc.sitePulse.blocked,
      inspectionsDue,
      callDownOpen,
    }),
    departmentHealth: buildDepartmentHealth(readiness.items),
    todaysWorkLinks: [
      {
        id: "walk",
        title: "Walk",
        description: `${oc.sitePulse.blocked} need attention · ${oc.sitePulse.ready} ready`,
        href: "/today/walk",
        icon: "locations",
      },
      {
        id: "coverage",
        title: "Coverage",
        description: `${staffingGaps} staffing gap${staffingGaps === 1 ? "" : "s"}`,
        href: "/today/coverage",
        icon: "todaysWork",
      },
      {
        id: "calldowns",
        title: "Call-downs",
        description: `${callDownOpen} open`,
        href: "/today/coverage",
        icon: "todaysWork",
      },
      {
        id: "handoffs",
        title: "Handoffs",
        description: "Exceptions and follow-ups for the next leader",
        href: "/today/handoffs",
        icon: "todaysWork",
      },
    ],
    operationsLinks: [
      {
        id: "oc",
        title: "Operations Center",
        description: "What is happening right now",
        href: "/dashboard",
        icon: "operationsCenter",
      },
      {
        id: "issues",
        title: "Issues",
        description: "Open repairs and issues",
        href: "/issues",
        icon: "repairs",
      },
      {
        id: "inspections",
        title: "Inspections",
        description: "Checklists and findings",
        href: "/admin/inspections",
        icon: "logs",
      },
      {
        id: "knowledge",
        title: "Knowledge",
        description: "SOPs and reference",
        href: "/admin/knowledge",
        icon: "administration",
      },
      {
        id: "assets",
        title: "Assets",
        description: "Equipment and plant assets",
        href: "/assets",
        icon: "assets",
      },
      {
        id: "logs",
        title: "Logs",
        description: "Compliance and temperature logs",
        href: "/logs",
        icon: "logs",
      },
    ],
    performance: [
      {
        id: "readiness",
        label: "Readiness",
        value: oc.sitePulse.headline,
        hint: `${oc.sitePulse.ready} ready · ${oc.sitePulse.blocked} need attention`,
        tone:
          oc.sitePulse.tone === "blocked"
            ? "blocked"
            : oc.sitePulse.tone === "at_risk"
              ? "warning"
              : oc.sitePulse.tone === "healthy"
                ? "ready"
                : "neutral",
      },
      {
        id: "compliance",
        label: "Log completion",
        value: `${oc.totals.completed}/${oc.totals.expected}`,
        hint: `${oc.totals.failed} failed · ${oc.totals.missed} missed`,
        tone: oc.totals.failed + oc.totals.missed > 0 ? "warning" : "ready",
      },
      {
        id: "open-work",
        label: "Open work",
        value: oc.openRepairCount,
        hint: `${oc.urgentRepairCount} urgent`,
        tone: oc.urgentRepairCount > 0 ? "blocked" : "neutral",
      },
      {
        id: "inspections",
        label: "Inspections due",
        value: inspectionsDue,
        hint: "Scheduled occurrences due within 24h",
        tone: inspectionsDue > 0 ? "warning" : "ready",
      },
    ],
    recentActivity,
  };

  return {
    role: input.role,
    visibleSections: resolveWorkspaceSections(input.role),
    data,
  };
}
