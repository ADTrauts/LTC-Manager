import type { RepairPriority } from "@prisma/client";

import type { OperationContext, OperationsCenterMealBoard } from "@/lib/operations-center";
import { fmtMealLabel } from "@/lib/operations-center/fmt-meal-label";

import type { CallDownItem } from "./call-down";
import type { CoverageItem } from "./coverage-list";
import type { WalkListItem } from "./walk-list";

export type HandoffCategory =
  | "log_exception"
  | "open_repair"
  | "call_down"
  | "coverage_gap"
  | "meal_service"
  | "inspection_finding"
  | "inspection_due";

export type HandoffPriority = "critical" | "high" | "normal";

export type HandoffItem = {
  id: string;
  category: HandoffCategory;
  categoryLabel: string;
  priority: HandoffPriority;
  title: string;
  detail: string;
  unitId: string | null;
  unitName: string | null;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export type HandoffSection = {
  key: string;
  title: string;
  description: string;
  items: HandoffItem[];
};

export type HandoffSummary = {
  total: number;
  critical: number;
  high: number;
  normal: number;
};

export type HandoffData = {
  sections: HandoffSection[];
  summary: HandoffSummary;
  operationContext: OperationContext;
  isClear: boolean;
};

export type HandoffRepairRecord = {
  id: string;
  title: string;
  priority: RepairPriority;
  unitId: string;
  unitName: string;
};

export type HandoffInspectionFindingRecord = {
  id: string;
  title: string;
  status: "OPEN" | "IN_PROGRESS";
  unitId: string;
  unitName: string;
};

export type HandoffScheduledInspectionRecord = {
  id: string;
  definitionId: string;
  definitionName: string;
  dueAt: Date;
  overdue: boolean;
  unitId: string;
  unitName: string;
};

const CATEGORY_LABEL: Record<HandoffCategory, string> = {
  log_exception: "Log exception",
  open_repair: "Open repair",
  call_down: "Call-down",
  coverage_gap: "Coverage gap",
  meal_service: "Meal service",
  inspection_finding: "Inspection finding",
  inspection_due: "Inspection due",
};

const PRIORITY_RANK: Record<HandoffPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

function sortHandoffItems(items: HandoffItem[]): HandoffItem[] {
  return [...items].sort((a, b) => {
    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.title.localeCompare(b.title);
  });
}

function handoffItemsFromWalkList(items: WalkListItem[]): HandoffItem[] {
  const handoffs: HandoffItem[] = [];

  for (const item of items) {
    if (item.failed > 0) {
      handoffs.push({
        id: `log-failed:${item.unitId}`,
        category: "log_exception",
        categoryLabel: CATEGORY_LABEL.log_exception,
        priority: "critical",
        title: `${item.unitName} — failed checks`,
        detail: `${item.failed} failed log${item.failed === 1 ? "" : "s"} today`,
        unitId: item.unitId,
        unitName: item.unitName,
        primaryHref: item.href,
        primaryLabel: "Unit workspace",
        secondaryHref: "/logs",
        secondaryLabel: "Logs",
      });
    }

    if (item.missed > 0) {
      handoffs.push({
        id: `log-missed:${item.unitId}`,
        category: "log_exception",
        categoryLabel: CATEGORY_LABEL.log_exception,
        priority: "high",
        title: `${item.unitName} — missed checks`,
        detail: `${item.missed} missed log${item.missed === 1 ? "" : "s"} may carry into the next operation`,
        unitId: item.unitId,
        unitName: item.unitName,
        primaryHref: item.href,
        primaryLabel: "Unit workspace",
        secondaryHref: "/logs",
        secondaryLabel: "Logs",
      });
    }

    if (item.pending > 0 && item.status !== "ready") {
      handoffs.push({
        id: `log-pending:${item.unitId}`,
        category: "log_exception",
        categoryLabel: CATEGORY_LABEL.log_exception,
        priority: item.status === "blocked" ? "high" : "normal",
        title: `${item.unitName} — logs still due`,
        detail: `${item.pending} check${item.pending === 1 ? "" : "s"} still due today`,
        unitId: item.unitId,
        unitName: item.unitName,
        primaryHref: item.href,
        primaryLabel: "Unit workspace",
        secondaryHref: "/logs",
        secondaryLabel: "Logs",
      });
    }
  }

  return handoffs;
}

function handoffItemsFromScheduledInspections(
  scheduled: HandoffScheduledInspectionRecord[],
): HandoffItem[] {
  return scheduled.map((row) => ({
    id: `inspection-due:${row.id}`,
    category: "inspection_due",
    categoryLabel: CATEGORY_LABEL.inspection_due,
    priority: row.overdue ? "high" : "normal",
    title: row.overdue
      ? `${row.definitionName} overdue`
      : `Complete ${row.definitionName}`,
    detail: row.overdue
      ? `${row.unitName} · inspection overdue`
      : `${row.unitName} · inspection due now`,
    unitId: row.unitId,
    unitName: row.unitName,
    primaryHref: `/unit/${row.unitId}?unitTab=overview&inspect=${row.definitionId}&occurrence=${row.id}`,
    primaryLabel: "Unit workspace",
  }));
}

function handoffItemsFromInspectionFindings(
  findings: HandoffInspectionFindingRecord[],
): HandoffItem[] {
  return findings.map((finding) => ({
    id: `inspection-finding:${finding.id}`,
    category: "inspection_finding",
    categoryLabel: CATEGORY_LABEL.inspection_finding,
    priority: "normal",
    title: finding.title,
    detail:
      finding.status === "IN_PROGRESS"
        ? `${finding.unitName} · corrective work is in progress`
        : `${finding.unitName} · follow-up needed from inspection`,
    unitId: finding.unitId,
    unitName: finding.unitName,
    primaryHref: `/unit/${finding.unitId}?unitTab=overview&followUpTask=${finding.id}`,
    primaryLabel: "Unit workspace",
  }));
}

function handoffItemsFromRepairs(repairs: HandoffRepairRecord[]): HandoffItem[] {
  return repairs.map((repair) => ({
    id: `repair:${repair.id}`,
    category: "open_repair",
    categoryLabel: CATEGORY_LABEL.open_repair,
    priority: repair.priority === "URGENT" ? "critical" : repair.priority === "HIGH" ? "high" : "normal",
    title: repair.title,
    detail: `${repair.unitName} · ${repair.priority.toLowerCase()} priority repair open`,
    unitId: repair.unitId,
    unitName: repair.unitName,
    primaryHref: "/repairs",
    primaryLabel: "Repairs",
    secondaryHref: `/unit/${repair.unitId}`,
    secondaryLabel: "Unit workspace",
  }));
}

function handoffItemsFromCallDowns(items: CallDownItem[]): HandoffItem[] {
  return items
    .filter((item) => item.status === "open")
    .map((item) => ({
      id: `call-down:${item.id}`,
      category: "call_down",
      categoryLabel: CATEGORY_LABEL.call_down,
      priority: "critical",
      title: `${item.employeeName} — ${item.templateLabel ?? "call-down"}`,
      detail: item.reason,
      unitId: item.oldUnitId ?? item.newUnitId,
      unitName: item.oldUnitName ?? item.newUnitName,
      primaryHref: item.staffingHref,
      primaryLabel: "Staffing",
      secondaryHref: item.coverageHref,
      secondaryLabel: "Coverage",
    }));
}

function handoffItemsFromCoverage(items: CoverageItem[]): HandoffItem[] {
  return items
    .filter((item) => item.level !== "covered")
    .map((item) => ({
      id: `coverage:${item.unitId}`,
      category: "coverage_gap",
      categoryLabel: CATEGORY_LABEL.coverage_gap,
      priority: item.level === "none" ? "critical" : "high",
      title: `${item.unitName} — ${item.level === "none" ? "no coverage" : "thin coverage"}`,
      detail: item.reason,
      unitId: item.unitId,
      unitName: item.unitName,
      primaryHref: item.staffingHref,
      primaryLabel: "Staffing",
      secondaryHref: "/today/coverage",
      secondaryLabel: "Coverage",
    }));
}

function handoffItemsFromMealBoards(
  mealBoards: OperationsCenterMealBoard[],
  operationContext: OperationContext,
): HandoffItem[] {
  if (operationContext.phase !== "Execution") {
    return [];
  }

  const board = mealBoards.find((item) => item.meal === operationContext.mealType);
  if (!board) {
    return [];
  }

  return board.rows
    .filter((row) => row.statusLabel === "—")
    .map((row) => ({
      id: `meal-service:${row.unitId}:${operationContext.mealType}`,
      category: "meal_service",
      categoryLabel: CATEGORY_LABEL.meal_service,
      priority: "high",
      title: `${row.unitName} — ${fmtMealLabel(operationContext.mealType)} not marked live`,
      detail: `${operationContext.serviceLabel} is in execution but ready/started is not logged`,
      unitId: row.unitId,
      unitName: row.unitName,
      primaryHref: `/unit/${row.unitId}`,
      primaryLabel: "Unit workspace",
      secondaryHref: "/today/coverage",
      secondaryLabel: "Coverage",
    }));
}

export function buildHandoffSections(input: {
  walkListItems: WalkListItem[];
  coverageItems: CoverageItem[];
  callDownItems: CallDownItem[];
  repairs: HandoffRepairRecord[];
  inspectionFindings?: HandoffInspectionFindingRecord[];
  scheduledInspections?: HandoffScheduledInspectionRecord[];
  mealBoards: OperationsCenterMealBoard[];
  operationContext: OperationContext;
}): HandoffSection[] {
  const inspectionFindings = input.inspectionFindings ?? [];
  const scheduledInspections = input.scheduledInspections ?? [];
  const immediate = sortHandoffItems([
    ...handoffItemsFromWalkList(input.walkListItems).filter((item) => item.priority === "critical"),
    ...handoffItemsFromCallDowns(input.callDownItems),
    ...handoffItemsFromCoverage(input.coverageItems).filter((item) => item.priority === "critical"),
    ...handoffItemsFromRepairs(input.repairs).filter((item) => item.priority === "critical"),
    ...handoffItemsFromMealBoards(input.mealBoards, input.operationContext),
    ...handoffItemsFromScheduledInspections(scheduledInspections).filter(
      (item) => item.priority === "high",
    ),
  ]);

  const compliance = sortHandoffItems(
    handoffItemsFromWalkList(input.walkListItems).filter((item) => item.priority !== "critical"),
  );

  const workforce = sortHandoffItems(
    handoffItemsFromCoverage(input.coverageItems).filter((item) => item.priority !== "critical"),
  );

  const equipment = sortHandoffItems([
    ...handoffItemsFromRepairs(input.repairs).filter((item) => item.priority !== "critical"),
    ...handoffItemsFromInspectionFindings(inspectionFindings),
    ...handoffItemsFromScheduledInspections(scheduledInspections).filter(
      (item) => item.priority !== "high",
    ),
  ]);

  const sections: HandoffSection[] = [
    {
      key: "immediate",
      title: "Needs attention before handoff",
      description: "Failed checks, open call-downs, and coverage gaps that can block the next team.",
      items: dedupeHandoffItems(immediate),
    },
    {
      key: "compliance",
      title: "Compliance follow-up",
      description: "Missed or pending logs that may carry into the next operation.",
      items: dedupeHandoffItems(compliance),
    },
    {
      key: "workforce",
      title: "Coverage between teams",
      description: "Thin staffing and unresolved call-down follow-up across locations.",
      items: dedupeHandoffItems(workforce),
    },
    {
      key: "equipment",
      title: "Repairs and inspection findings",
      description: "Open work orders and unresolved inspection follow-ups for the next service period.",
      items: dedupeHandoffItems(equipment),
    },
  ];

  return sections.filter((section) => section.items.length > 0);
}

function dedupeHandoffItems(items: HandoffItem[]): HandoffItem[] {
  const seen = new Set<string>();
  const result: HandoffItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export function summarizeHandoffs(sections: HandoffSection[]): HandoffSummary {
  let total = 0;
  let critical = 0;
  let high = 0;
  let normal = 0;

  for (const section of sections) {
    for (const item of section.items) {
      total += 1;
      if (item.priority === "critical") critical += 1;
      else if (item.priority === "high") high += 1;
      else normal += 1;
    }
  }

  return { total, critical, high, normal };
}

export function buildHandoffData(input: {
  walkListItems: WalkListItem[];
  coverageItems: CoverageItem[];
  callDownItems: CallDownItem[];
  repairs: HandoffRepairRecord[];
  inspectionFindings?: HandoffInspectionFindingRecord[];
  scheduledInspections?: HandoffScheduledInspectionRecord[];
  mealBoards: OperationsCenterMealBoard[];
  operationContext: OperationContext;
}): HandoffData {
  const sections = buildHandoffSections(input);
  const summary = summarizeHandoffs(sections);

  return {
    sections,
    summary,
    operationContext: input.operationContext,
    isClear: summary.total === 0,
  };
}
