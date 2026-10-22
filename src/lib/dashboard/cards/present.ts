import type { SupervisorAssetExceptionItem } from "@/lib/asset-operations/load-runtime-assets";
import { presentDashboardWorkspace } from "@/lib/business-workspace/dashboard/from-runtime-state";
import type { WorkspaceActivityRaw } from "@/lib/business-workspace/load-workspace-extras";
import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import type { PmRunBoardCounts } from "@/lib/preventive-maintenance/run-board";
import type { GmCycleSummary } from "@/lib/operational-cycles/load-gm-cycle-summary";
import type { RunDepartmentOperationPresentation } from "@/lib/operational-cycles/present-run-operation";
import type { RuntimeLocationState } from "@/lib/runtime-location-state";
import type { SupervisorDailyCoverageProjection } from "@/lib/scheduling/supervisor-daily-coverage";
import type { CallDownData } from "@/lib/todays-work/call-down";
import type { HandoffData } from "@/lib/todays-work/handoffs";
import type { TodaysExpectedWorkView } from "@/lib/todays-work/expected-work/types";
import type { OperatingLocationStatus } from "@/lib/todays-work/operating-locations/types";

import { plural, type DashboardAttentionItem } from "../attention";
import { attentionFromCoverage } from "../attention-mappers/coverage";
import { attentionFromRecords } from "../attention-mappers/records";
import type { PlantTriageRequestFact } from "../attention-mappers/plant-requests";
import type { NotConfiguredReason } from "../capabilities";
import type { DashboardFacilityReadiness, DashboardMenuFacts } from "../facts";
import type { DashboardDepartmentAccessMode } from "../viewer/types";

import type {
  CardResult,
  DashboardCardLine,
  DashboardMetric,
  DashboardReadyModel,
  DashboardSummaryModel,
} from "./types";

const QUIET = "Nothing needs anyone right now.";

export function ready(metrics: DashboardMetric[], lines: DashboardCardLine[] = [], attention: DashboardAttentionItem[] = []): CardResult<DashboardReadyModel> {
  return { state: "ready", model: { metrics, lines }, attention };
}

export function summary(metrics: DashboardMetric[]): CardResult<DashboardSummaryModel> {
  return { state: "ready", model: { metrics }, attention: [] };
}

export function quiet(message = QUIET): CardResult<never> {
  return { state: "quiet", message };
}

function tone(late: number, attentionCount: number): DashboardMetric["tone"] {
  if (late > 0) return "late";
  if (attentionCount > 0) return "attention";
  return "ok";
}

function metric(label: string, value: number | string, metricTone: DashboardMetric["tone"]): DashboardMetric {
  return { label, value, tone: metricTone };
}

function line(input: {
  id: string;
  title: string;
  detail?: string | null;
  tone: DashboardMetric["tone"];
  href?: string | null;
}): DashboardCardLine {
  return {
    id: input.id,
    title: input.title,
    detail: input.detail ?? null,
    tone: input.tone,
    href: input.href ?? null,
  };
}

export function presentCoverage(input: {
  departmentIds: readonly string[];
  states: readonly RuntimeLocationState[];
  callOffs: readonly CallDownData[];
  coverage: readonly SupervisorDailyCoverageProjection[];
  team: boolean;
  mode: "full" | "summary";
}): CardResult<DashboardReadyModel> | CardResult<DashboardSummaryModel> {
  const gaps = input.departmentIds.flatMap((departmentId) =>
    attentionFromCoverage({ departmentId, states: input.states, callDowns: null }),
  );
  const openCallOffs = input.callOffs.reduce((sum, row) => sum + row.summary.open, 0);
  const floorsUncovered = input.team
    ? 0
    : input.coverage.reduce((sum, row) => sum + row.summary.floorUncoveredCount, 0);
  const needingPlace = input.team
    ? 0
    : input.coverage.reduce(
        (sum, row) => sum + row.employees.filter((employee) => employee.relationship === "SCHEDULED_UNASSIGNED").length,
        0,
      );
  if (input.mode === "summary") {
    return summary([
      metric("Coverage gaps", gaps.length, tone(gaps.length, 0)),
      metric("Call-offs not covered", openCallOffs, tone(openCallOffs, 0)),
    ]);
  }
  if (gaps.length === 0 && openCallOffs === 0 && floorsUncovered === 0 && needingPlace === 0) {
    return quiet("Coverage is in place.");
  }
  const lines = [
    ...gaps.map((item) => line({ id: item.id, title: item.title, detail: item.detail, tone: "late", href: item.href })),
    ...input.callOffs.flatMap((row) =>
      row.items
        .filter((item) => item.status === "open")
        .map((item) =>
          line({
            id: item.id,
            title: item.employeeName,
            detail: item.reason,
            tone: "late",
            href: item.staffingHref,
          }),
        ),
    ),
    ...(input.team
      ? []
      : input.coverage.flatMap((row) =>
          row.employees
            .filter((employee) => employee.relationship === "SCHEDULED_UNASSIGNED")
            .map((employee) =>
              line({
                id: employee.employeeId,
                title: `${employee.employeeFirstName} ${employee.employeeLastName}`.trim(),
                detail: employee.relationshipLabel,
                tone: "attention",
                href: employee.assignCoverageHref,
              }),
            ),
        )),
  ];
  return ready(
    [
      metric("Coverage gaps", gaps.length, tone(gaps.length, 0)),
      metric("Call-offs not covered", openCallOffs, tone(openCallOffs, 0)),
      ...(floorsUncovered > 0 ? [metric("Floors uncovered", floorsUncovered, "late")] : []),
      ...(needingPlace > 0 ? [metric("People needing a place", needingPlace, "attention")] : []),
    ],
    lines,
  );
}

export function presentCallOffs(input: { callOffs: readonly CallDownData[] }): CardResult<DashboardReadyModel> {
  const open = input.callOffs.reduce((sum, row) => sum + row.summary.open, 0);
  const covered = input.callOffs.reduce((sum, row) => sum + row.summary.covered, 0);
  if (open === 0) return quiet(covered > 0 ? "Today's call-offs are covered." : "No call-offs today.");
  const lines = input.callOffs.flatMap((row) =>
    row.items
      .filter((item) => item.status === "open")
      .map((item) =>
        line({
          id: item.id,
          title: item.employeeName,
          detail: item.reason,
          tone: "late",
          href: item.staffingHref,
        }),
      ),
  );
  return ready([metric("Not covered", open, "late"), metric("Covered", covered, "ok")], lines);
}

export function presentShiftNow(input: {
  presentation: RunDepartmentOperationPresentation | null;
  states: readonly RuntimeLocationState[];
  mode: "full" | "summary";
}): CardResult<DashboardReadyModel> | CardResult<DashboardSummaryModel> {
  const pace = presentDashboardWorkspace(input.states).pace;
  const late = pace.at_risk > 0 || (input.presentation?.overdueIncompleteCount ?? 0) > 0;
  const rhythm = late ? "Late" : "On track";
  if (input.mode === "summary") {
    return summary([metric("Operating Rhythm", rhythm, late ? "late" : "ok")]);
  }
  const current = input.presentation?.currentOperations[0] ?? null;
  if (!current && !input.presentation?.nextOperation) return quiet("Nothing is in service right now.");
  const phase = current?.phaseLabel ?? current?.windowLabel;
  const where = [current?.cycleLabel, phase].filter(Boolean).join(" · ") || input.presentation?.nextOperation?.label || "In service";
  const nextKey = input.presentation?.keyTimeSummaries.find((row) => row.completed < row.total);
  return ready(
    [metric("Now", where, late ? "late" : "ok"), metric("Operating Rhythm", rhythm, late ? "late" : "ok")],
    nextKey
      ? [line({ id: "next-key", title: nextKey.label, detail: nextKey.dueLabel, tone: nextKey.overdue > 0 ? "late" : "ok" })]
      : [],
  );
}

export function presentTimeline(input: {
  presentation: RunDepartmentOperationPresentation | null;
  summary: GmCycleSummary | null;
  mode: "full" | "summary";
}): CardResult<DashboardReadyModel> | CardResult<DashboardSummaryModel> {
  const lateCount = (input.summary?.readiness.late ?? 0) + (input.presentation?.keyTimeSummaries.reduce((sum, row) => sum + row.overdue, 0) ?? 0);
  const remaining = input.presentation?.keyTimeSummaries.filter((row) => row.completed < row.total) ?? [];
  const late = lateCount > 0;
  if (input.mode === "summary") {
    return summary([metric("Operating Rhythm", late ? "Late" : "On track", late ? "late" : "ok")]);
  }
  if (!late && remaining.length === 0 && (input.summary?.readiness.notConfirmed ?? 0) === 0) {
    return quiet("Nothing is left on today's rhythm.");
  }
  return ready(
    [
      metric("Late", lateCount, tone(lateCount, 0)),
      metric("Still to come", remaining.length, tone(0, remaining.length)),
    ],
    remaining.map((row) =>
      line({
        id: row.label,
        title: row.label,
        detail: `${row.completed} of ${row.total} · ${row.dueLabel}`,
        tone: row.overdue > 0 ? "late" : "attention",
      }),
    ),
  );
}

export function presentExpectedWork(view: TodaysExpectedWorkView): CardResult<DashboardReadyModel> {
  const items = [...view.currentGroups.flatMap((group) => group.locations), ...view.otherWork].flatMap((location) =>
    location.plans.flatMap((plan) => plan.items.map((item) => ({ item, locationName: location.locationName }))),
  );
  const late = items.filter((row) => row.item.state === "PAST_DUE_NOT_CONFIRMED" || row.item.state === "CONFLICT_REVIEW");
  const due = items.filter((row) => row.item.state === "DUE" || row.item.state === "CURRENT");
  if (late.length === 0 && due.length === 0) return quiet("Today's Work is on track.");
  return ready(
    [metric("Late", late.length, tone(late.length, 0)), metric("Due", due.length, tone(0, due.length))],
    [...late, ...due].map((row) =>
      line({
        id: row.item.occurrenceKey,
        title: row.item.label,
        detail: row.locationName,
        tone: row.item.state === "PAST_DUE_NOT_CONFIRMED" || row.item.state === "CONFLICT_REVIEW" ? "late" : "attention",
        href: "/staffing/work-plans",
      }),
    ),
  );
}

export function presentRecords(input: {
  departmentIds: readonly string[];
  states: readonly RuntimeLocationState[];
  requirements: readonly RunLogRequirementView[];
  mode: "full" | "summary";
}): CardResult<DashboardReadyModel> | CardResult<DashboardSummaryModel> {
  const attention = input.departmentIds.flatMap((departmentId) =>
    attentionFromRecords({
      departmentId,
      engine: "CANONICAL",
      states: input.states,
      requirements: input.requirements,
    }),
  );
  const overdue = attention.filter((item) => item.severity === "act_now").length;
  const due = attention.filter((item) => item.severity === "due_soon").length;
  const onTime = input.requirements.filter((row) => row.productState === "COMPLETED" || row.productState === "COMPLETED_WITH_EXCEPTION").length;
  if (input.mode === "summary") {
    return summary([
      metric("Overdue", overdue, tone(overdue, 0)),
      metric("Due", due, tone(0, due)),
      metric("On time", onTime, "ok"),
    ]);
  }
  if (attention.length === 0) return quiet("Records are on time.");
  return ready(
    [metric("Overdue", overdue, tone(overdue, 0)), metric("Due", due, tone(0, due)), metric("On time", onTime, "ok")],
    attention.map((item) =>
      line({
        id: item.id,
        title: item.title,
        detail: item.detail,
        tone: item.severity === "act_now" ? "late" : "attention",
        href: item.href,
      }),
    ),
  );
}

export function presentMaintenance(input: {
  exceptions: readonly SupervisorAssetExceptionItem[];
  orders: readonly { id: string; title: string; detail: string; late: boolean; href: string }[];
}): CardResult<DashboardReadyModel> {
  if (input.exceptions.length === 0 && input.orders.length === 0) return quiet("Nothing is waiting on a repair.");
  const late = input.exceptions.filter((item) => item.temporal === "Late").length + input.orders.filter((order) => order.late).length;
  return ready(
    [metric("Open", input.exceptions.length + input.orders.length, tone(late, input.exceptions.length + input.orders.length))],
    [
      ...input.exceptions.map((item) =>
        line({
          id: item.issueId ?? item.workOrderId ?? item.assetId ?? item.sourceHref,
          title: item.status,
          detail: item.unitName,
          tone: item.temporal === "Late" ? "late" : "attention",
          href: item.sourceHref,
        }),
      ),
      ...input.orders.map((order) =>
        line({ id: order.id, title: order.title, detail: order.detail, tone: order.late ? "late" : "attention", href: order.href }),
      ),
    ],
  );
}

export function presentPm(input: { counts: PmRunBoardCounts; publishedPlanCount: number }): CardResult<DashboardReadyModel> {
  if (input.publishedPlanCount === 0) {
    return { state: "not_configured", reason: { capability: "plant.maintenance", message: "No preventive maintenance plans are published." } };
  }
  const late = input.counts.overdue;
  const soon = input.counts.dueToday + input.counts.dueSoon + input.counts.unassigned;
  if (late === 0 && soon === 0) return quiet("Preventive maintenance is up to date.");
  return ready(
    [
      metric("Overdue", input.counts.overdue, tone(input.counts.overdue, 0)),
      metric("Due today", input.counts.dueToday, tone(0, input.counts.dueToday)),
      metric("Unassigned", input.counts.unassigned, tone(0, input.counts.unassigned)),
    ],
    [],
  );
}

export function presentTriage(requests: readonly PlantTriageRequestFact[] | null): CardResult<DashboardReadyModel> {
  const waiting = requests ?? [];
  if (waiting.length === 0) return quiet("Nothing is waiting to be routed.");
  const late = waiting.filter((request) => request.priority === "EMERGENCY" || request.priority === "URGENT").length;
  return ready(
    [metric("Waiting", waiting.length, tone(late, waiting.length))],
    waiting.map((request) =>
      line({
        id: request.id,
        title: request.summary,
        detail: request.requestingDepartment.name,
        tone: request.priority === "EMERGENCY" || request.priority === "URGENT" ? "late" : "attention",
        href: "/repairs",
      }),
    ),
  );
}

export function presentAttention(items: readonly DashboardAttentionItem[]): CardResult<DashboardReadyModel> {
  if (items.length === 0) return quiet();
  const late = items.filter((item) => item.severity === "act_now").length;
  return ready(
    [metric("Needs someone", items.length, tone(late, items.length))],
    items.map((item) =>
      line({
        id: item.id,
        title: item.title,
        detail: item.detail,
        tone: item.severity === "act_now" ? "late" : item.severity === "due_soon" ? "attention" : "ok",
        href: item.href,
      }),
    ),
    [...items],
  );
}

export function presentRounds(locations: readonly OperatingLocationStatus[]): CardResult<DashboardReadyModel> {
  const walking = locations.filter((location) => location.derivedStatus !== "on_track");
  if (walking.length === 0) return quiet("Every location on the walk is on track.");
  return ready(
    [metric("To walk", walking.length, tone(locations.filter((row) => row.derivedStatus === "needs_attention").length, walking.length))],
    walking.map((location) =>
      line({
        id: location.location.id,
        title: location.displayName,
        detail: location.issueSummary ?? location.currentOperation.label,
        tone: location.derivedStatus === "needs_attention" ? "late" : "attention",
        href: location.href,
      }),
    ),
  );
}

export function presentHandoff(data: HandoffData): CardResult<DashboardReadyModel> {
  if (data.isClear) return quiet("The next shift has a clear handoff.");
  const late = data.summary.critical + data.summary.high;
  const items = data.sections.flatMap((section) => section.items);
  return ready(
    [metric("To hand off", data.summary.total, tone(late, data.summary.total))],
    items.map((item) =>
      line({
        id: item.id,
        title: item.title,
        detail: item.detail,
        tone: item.priority === "critical" || item.priority === "high" ? "late" : "attention",
        href: item.primaryHref,
      }),
    ),
  );
}

export function presentMenus(input: { menus: DashboardMenuFacts; roomIds: readonly string[] }): CardResult<DashboardReadyModel> {
  if (input.menus.unavailable) return { state: "unavailable", reason: "error" };
  const active = input.menus.menus;
  const missingSetup = active.filter((menu) => menu.locationCount === 0 || menu.cycleCount === 0);
  const covered = new Set(active.flatMap((menu) => menu.spaceIds));
  const missingRooms = input.roomIds.filter((roomId) => !covered.has(roomId)).length;
  if (active.length === 0) {
    return ready([metric("Active menus", 0, "attention")], [line({ id: "none", title: "No Menu is active", tone: "attention", href: "/menus" })]);
  }
  return ready(
    [
      metric("Active menus", active.length, "ok"),
      metric("Locations without a Menu", missingRooms, tone(0, missingRooms)),
    ],
    [
      ...active.map((menu) => line({ id: menu.id, title: menu.name, detail: "Active", tone: "ok", href: `/menus/${menu.id}` })),
      ...missingSetup.map((menu) =>
        line({
          id: `${menu.id}:setup`,
          title: menu.name,
          detail: menu.locationCount === 0 ? "This active Menu has no locations yet." : "This active Menu has no Operational Cycles yet.",
          tone: "attention",
          href: `/menus/${menu.id}`,
        }),
      ),
    ],
  );
}

export type GlanceRow = {
  departmentId: string;
  name: string;
  access: DashboardDepartmentAccessMode;
  operatingModel: "SELF_OPERATED" | "VENDOR_RUN";
  operatorName: string | null;
  attention: number;
  coverageGaps: number;
  overdueRecords: number;
  openWorkOrders: number;
  openRequests: number;
};

export function presentGlance(rows: readonly GlanceRow[]): CardResult<DashboardReadyModel> {
  if (rows.length === 0) return quiet("No Departments are on this Dashboard.");
  const needing = rows.filter(
    (row) => row.attention + row.coverageGaps + row.overdueRecords + row.openWorkOrders + row.openRequests > 0,
  );
  return ready(
    [metric("Departments needing attention", needing.length, tone(needing.length, 0))],
    rows.map((row) => {
      const countsOnly = row.access === "SUMMARY";
      const operator =
        row.operatingModel === "VENDOR_RUN"
          ? countsOnly || !row.operatorName
            ? "Vendor-run"
            : `Vendor-run · ${row.operatorName}`
          : "Self-operated";
      const counts = [
        row.attention > 0 ? plural(row.attention, "place needs attention", "places need attention") : null,
        row.coverageGaps > 0 ? plural(row.coverageGaps, "coverage gap") : null,
        row.overdueRecords > 0 ? plural(row.overdueRecords, "overdue Record") : null,
        row.openWorkOrders > 0 ? plural(row.openWorkOrders, "open repair") : null,
        row.openRequests > 0 ? plural(row.openRequests, "open request to Plant") : null,
      ].filter((part): part is string => part != null);
      const hot = row.attention + row.overdueRecords + row.coverageGaps + row.openRequests;
      return line({
        id: row.departmentId,
        title: row.name,
        detail: counts.length > 0 ? `${operator} · ${counts.join(" · ")}` : operator,
        tone: tone(hot, 0),
        href: countsOnly ? null : `/dashboard?scope=department:${row.departmentId}`,
      });
    }),
  );
}

export function presentDepartmentSetup(input: {
  reasons: readonly NotConfiguredReason[];
  mode: "full" | "summary";
}): CardResult<DashboardReadyModel> | CardResult<DashboardSummaryModel> {
  const open = input.reasons.length > 0;
  if (input.mode === "summary") {
    return summary([metric("Setup", open ? "Not complete" : "Complete", open ? "attention" : "ok")]);
  }
  if (!open) return quiet("Setup is complete.");
  return ready(
    [metric("Still to set up", input.reasons.length, "attention")],
    input.reasons.map((reason) =>
      line({ id: reason.capability, title: reason.message, tone: "attention", href: null }),
    ),
  );
}

export function presentFacilitySetup(readiness: DashboardFacilityReadiness): CardResult<DashboardReadyModel> {
  const missingLeader = readiness.needingHead.length;
  const missingPeople = readiness.unassignedPeople;
  const missingPlaces = readiness.locations === 0 ? 1 : 0;
  if (missingLeader === 0 && missingPeople === 0 && missingPlaces === 0) return quiet("The facility is set up.");
  return ready(
    [
      metric("Departments missing a leader", missingLeader, tone(0, missingLeader)),
      metric("People missing a Department", missingPeople, tone(0, missingPeople)),
      metric("Locations", readiness.locations, missingPlaces > 0 ? "attention" : "ok"),
    ],
    readiness.needingHead.map((department) =>
      line({
        id: department.id,
        title: department.name,
        detail: "Needs a head",
        tone: "attention",
        href: "/admin/departments",
      }),
    ),
  );
}

export function presentActivity(activity: WorkspaceActivityRaw): CardResult<DashboardReadyModel> {
  const lines = [
    ...activity.repairsOpened.map((row) =>
      line({ id: `opened:${row.id}`, title: row.title, detail: `${row.unitName} · opened`, tone: "attention", href: `/repairs/${row.id}` }),
    ),
    ...activity.repairsResolved.map((row) =>
      line({ id: `resolved:${row.id}`, title: row.title, detail: `${row.unitName} · resolved`, tone: "ok", href: `/repairs/${row.id}` }),
    ),
    ...activity.knowledgePublished.map((row) =>
      line({ id: `knowledge:${row.id}`, title: row.title, detail: "Procedure published", tone: "ok", href: "/build/knowledge" }),
    ),
  ];
  if (lines.length === 0) return quiet("Nothing changed in the last seven days.");
  return ready([metric("Changes", lines.length, "ok")], lines);
}

export function presentShortcuts(
  actions: readonly { id: string; title: string; href: string }[],
): CardResult<DashboardReadyModel> {
  if (actions.length === 0) return quiet("No shortcuts are open for this role.");
  return ready(
    [],
    actions.map((action) => line({ id: action.id, title: action.title, tone: "ok", href: action.href })),
  );
}
