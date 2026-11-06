import { workOrderStatusAuthorityLabel } from "@/lib/asset-operations/work-order-semantics";
import { buildQuickActions } from "@/lib/dashboard/shortcuts/build-quick-actions";
import { resolveCompositionConfig } from "@/lib/dashboard/shortcuts/workspace-composition";
import type { WorkspaceContext } from "@/lib/dashboard/shortcuts/types";
import { emptyPmRunBoardCounts, type PmRunBoardCounts } from "@/lib/preventive-maintenance/run-board";
import { filterCallDownsToProjectedUnits } from "@/lib/todays-work/projection/assemble";
import { presentHandoffsFromBoard } from "@/lib/staffing/handoffs/present-handoffs-from-board";

import { mergeAttentionItems, scopeAttentionToViewer } from "../attention";
import { attentionFromAssetExceptions } from "../attention-mappers/asset-exceptions";
import { attentionFromCoverage } from "../attention-mappers/coverage";
import { attentionFromMenus } from "../attention-mappers/menus";
import { attentionFromPlantPm } from "../attention-mappers/plant-pm";
import { attentionFromPlantRequests } from "../attention-mappers/plant-requests";
import { attentionFromRecords } from "../attention-mappers/records";
import { attentionFromRuntimeLocations } from "../attention-mappers/runtime-locations";
import { isDashboardHrefAuthorized } from "../drill-down";
import type { DashboardFactPack } from "../facts";
import type { DashboardViewer } from "../viewer/types";

import {
  presentActivity,
  presentAttention,
  presentCallOffs,
  presentCoverage,
  presentDepartmentSetup,
  presentExpectedWork,
  presentFacilitySetup,
  presentGlance,
  presentHandoff,
  presentMaintenance,
  presentMenus,
  presentPm,
  presentRecords,
  presentRounds,
  presentShiftNow,
  presentShortcuts,
  presentTimeline,
  presentTriage,
  quiet,
  type GlanceRow,
} from "./present";
import type { CardLoadInput, CardResult, DashboardReadyModel, DashboardSummaryModel } from "./types";

const WRITE_SHORTCUTS = new Set(["report-issue", "assignment-board"]);
const HIDDEN_SHORTCUTS = new Set(["new-inspection", "operations-center"]);

async function safe<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

function departmentIdInScope(viewer: DashboardViewer): string | null {
  const scope = viewer.scope;
  if (!scope || scope.kind === "FACILITY") return null;
  return scope.departmentId;
}

function addPmCounts(left: PmRunBoardCounts, right: PmRunBoardCounts): PmRunBoardCounts {
  return {
    overdue: left.overdue + right.overdue,
    dueToday: left.dueToday + right.dueToday,
    dueSoon: left.dueSoon + right.dueSoon,
    unassigned: left.unassigned + right.unassigned,
    needsConfiguration: left.needsConfiguration + right.needsConfiguration,
    completed: left.completed + right.completed,
    skipped: left.skipped + right.skipped,
    projected: left.projected + right.projected,
  };
}

async function plantDepartmentIds(facts: DashboardFactPack): Promise<string[]> {
  const capabilities = await facts.capabilities();
  return facts.departmentIds.filter((id) => capabilities.get(id)?.has.has("plant.maintenance"));
}

async function coverageInput(input: CardLoadInput) {
  const { facts, viewer } = input;
  const [states, callOffs, coverage] = await Promise.all([
    facts.runtimeLocations(),
    Promise.all(facts.departmentIds.map((id) => safe(() => facts.callOffs(id), emptyCallOffs()))),
    Promise.all(facts.departmentIds.map((id) => safe(() => facts.dailyCoverage(id), emptyCoverage(id)))),
  ]);
  return {
    departmentIds: facts.departmentIds,
    states,
    callOffs,
    coverage,
    team: viewer.scope?.kind === "TEAM",
  };
}

function emptyCallOffs() {
  return { items: [], summary: { total: 0, open: 0, covered: 0 }, dateIso: "" };
}

function emptyCoverage(departmentId: string) {
  return {
    serviceDate: "",
    departmentId,
    departmentName: "",
    summary: {
      workingCount: 0,
      assignedCount: 0,
      needAssignmentCount: 0,
      assignedUnscheduledCount: 0,
      floorFullCount: 0,
      floorPartialCount: 0,
      floorUncoveredCount: 0,
    },
    employees: [],
    floors: [],
    neighborhoods: [],
    emptyMessage: null,
    locationScopeNote: null,
  };
}

export async function loadCoverage(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  return presentCoverage({ ...(await coverageInput(input)), mode: "full" }) as CardResult<DashboardReadyModel>;
}

export async function loadCoverageSummary(input: CardLoadInput): Promise<CardResult<DashboardSummaryModel>> {
  return presentCoverage({ ...(await coverageInput(input)), mode: "summary" }) as CardResult<DashboardSummaryModel>;
}

export async function loadCallOffs(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const callOffs = await Promise.all(input.facts.departmentIds.map((id) => safe(() => input.facts.callOffs(id), emptyCallOffs())));
  return presentCallOffs({ callOffs });
}

export async function loadShiftNow(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentId = departmentIdInScope(input.viewer);
  if (!departmentId) return quiet("Nothing is in service right now.");
  const [presentation, states] = await Promise.all([
    input.facts.runPresentation(departmentId),
    input.facts.runtimeLocations(),
  ]);
  return presentShiftNow({
    presentation,
    states: states.filter((state) => state.identity.location.departmentId === departmentId),
    mode: "full",
  }) as CardResult<DashboardReadyModel>;
}

export async function loadShiftNowSummary(input: CardLoadInput): Promise<CardResult<DashboardSummaryModel>> {
  const departmentId = departmentIdInScope(input.viewer);
  if (!departmentId) return { state: "ready", model: { metrics: [{ label: "Operating Rhythm", value: "On track", tone: "ok" }] }, attention: [] };
  const [presentation, states] = await Promise.all([
    input.facts.runPresentation(departmentId),
    input.facts.runtimeLocations(),
  ]);
  return presentShiftNow({
    presentation,
    states: states.filter((state) => state.identity.location.departmentId === departmentId),
    mode: "summary",
  }) as CardResult<DashboardSummaryModel>;
}

export async function loadTimeline(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentId = departmentIdInScope(input.viewer);
  if (!departmentId) return quiet("Nothing is left on today's rhythm.");
  const [presentation, cycleSummary] = await Promise.all([
    input.facts.runPresentation(departmentId),
    input.facts.cycleSummary(departmentId),
  ]);
  return presentTimeline({ presentation, summary: cycleSummary, mode: "full" }) as CardResult<DashboardReadyModel>;
}

export async function loadTimelineSummary(input: CardLoadInput): Promise<CardResult<DashboardSummaryModel>> {
  const departmentId = departmentIdInScope(input.viewer);
  if (!departmentId) return { state: "ready", model: { metrics: [{ label: "Operating Rhythm", value: "On track", tone: "ok" }] }, attention: [] };
  const [presentation, cycleSummary] = await Promise.all([
    input.facts.runPresentation(departmentId),
    input.facts.cycleSummary(departmentId),
  ]);
  return presentTimeline({ presentation, summary: cycleSummary, mode: "summary" }) as CardResult<DashboardSummaryModel>;
}

export async function loadExpectedWork(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentId = departmentIdInScope(input.viewer);
  if (!departmentId) return quiet("Today's Work is on track.");
  return presentExpectedWork(await input.facts.expectedWork(departmentId));
}

export async function loadRecords(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  return presentRecords({ ...(await recordsInput(input)), mode: "full" }) as CardResult<DashboardReadyModel>;
}

export async function loadRecordsSummary(input: CardLoadInput): Promise<CardResult<DashboardSummaryModel>> {
  return presentRecords({ ...(await recordsInput(input)), mode: "summary" }) as CardResult<DashboardSummaryModel>;
}

async function recordsInput(input: CardLoadInput) {
  const capabilities = await input.facts.capabilities();
  const departmentIds = input.facts.departmentIds.filter((id) => capabilities.get(id)?.has.has("records.canonical"));
  const [states, requirements] = await Promise.all([
    input.facts.runtimeLocations(),
    Promise.all(departmentIds.map((id) => safe(() => input.facts.runLogRequirements(id), []))),
  ]);
  return { departmentIds, states, requirements: requirements.flat() };
}

export async function loadMaintenance(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const rows = await Promise.all(
    input.facts.departmentIds.map(async (departmentId) => {
      const [exceptions, orders] = await Promise.all([
        safe(() => input.facts.assetExceptions(departmentId), []),
        safe(() => input.facts.workOrders(departmentId), []),
      ]);
      return { exceptions, orders };
    }),
  );
  return presentMaintenance({
    exceptions: rows.flatMap((row) => row.exceptions),
    orders: rows.flatMap((row) =>
      row.orders.flatMap((order) => {
        const status = order.presentation.status;
        if (status === "COMPLETED" || status === "CANCELED") return [];
        const title = order.workOrder.title?.trim() || order.workOrder.repairCode || "Work order";
        const late = order.presentation.priority === "URGENT" || order.presentation.priority === "EMERGENCY";
        return [
          {
            id: order.workOrder.id,
            title,
            detail: workOrderStatusAuthorityLabel(status),
            late,
            href: `/repairs/${order.workOrder.id}`,
          },
        ];
      }),
    ),
  });
}

export async function loadPm(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const plantIds = await plantDepartmentIds(input.facts);
  if (plantIds.length === 0) return quiet("Preventive maintenance is up to date.");
  const boards = await Promise.all(plantIds.map((id) => safe(() => input.facts.pmBoard(id), null)));
  const present = boards.filter((board): board is NonNullable<typeof board> => board != null);
  const counts = present.reduce((sum, board) => addPmCounts(sum, board.counts), emptyPmRunBoardCounts());
  const publishedPlanCount = present.reduce((sum, board) => sum + board.publishedPlanCount, 0);
  return presentPm({ counts, publishedPlanCount });
}

export async function loadTriage(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const plantIds = await plantDepartmentIds(input.facts);
  const queues = await Promise.all(plantIds.map((id) => safe(() => input.facts.triage(id), null)));
  const requests = queues.flatMap((queue) => queue ?? []);
  if (queues.every((queue) => queue == null)) return presentTriage(null);
  return presentTriage(requests);
}

export async function loadAttention(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const { facts, viewer } = input;
  const [states, capabilities] = await Promise.all([facts.runtimeLocations(), facts.capabilities()]);
  const lists = [attentionFromRuntimeLocations(states)];
  await Promise.all(
    facts.departmentIds.map(async (departmentId) => {
      const capability = capabilities.get(departmentId);
      const [callOffs, requirements, exceptions] = await Promise.all([
        safe(() => facts.callOffs(departmentId), emptyCallOffs()),
        capability?.has.has("records.canonical") ? safe(() => facts.runLogRequirements(departmentId), []) : Promise.resolve([]),
        safe(() => facts.assetExceptions(departmentId), []),
      ]);
      lists.push(attentionFromCoverage({ departmentId, states, callDowns: callOffs }));
      lists.push(
        attentionFromRecords({
          departmentId,
          engine: capability?.has.has("records.canonical") ? "CANONICAL" : "LEGACY",
          states,
          requirements,
        }),
      );
      lists.push(attentionFromAssetExceptions({ departmentId, items: exceptions }));
      if (capability?.has.has("menus")) {
        const menus = await safe(() => facts.menus(departmentId), { menus: [], unavailable: null });
        lists.push(
          attentionFromMenus({
            departmentId,
            menus: menus.menus.map((menu) => ({
              menuId: menu.id,
              name: menu.name,
              attention: [
                ...(menu.locationCount === 0
                  ? [{ code: "ACTIVE_WITHOUT_LOCATIONS" as const, message: "This active Menu has no locations yet." }]
                  : []),
                ...(menu.cycleCount === 0
                  ? [{ code: "ACTIVE_WITHOUT_CYCLES" as const, message: "This active Menu has no Operational Cycles yet." }]
                  : []),
              ],
            })),
          }),
        );
      }
      if (capability?.has.has("plant.maintenance")) {
        const board = await safe(() => facts.pmBoard(departmentId), null);
        if (board) lists.push(attentionFromPlantPm({ departmentId, counts: board.counts }));
        const queue = await safe(() => facts.triage(departmentId), null);
        if (queue) lists.push(attentionFromPlantRequests({ plantDepartmentId: departmentId, requests: queue }));
      }
    }),
  );
  return presentAttention(scopeAttentionToViewer(viewer, mergeAttentionItems(...lists)));
}

function teamLocations<T extends { location: { rooms: readonly { spaceId: string }[] } }>(
  viewer: DashboardViewer,
  locations: readonly T[],
): T[] {
  if (viewer.scope?.kind !== "TEAM" || viewer.scope.roomIds.length === 0) return [...locations];
  const rooms = new Set(viewer.scope.roomIds);
  return locations.filter((location) => location.location.rooms.some((room) => rooms.has(room.spaceId)));
}

export async function loadRounds(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentId = departmentIdInScope(input.viewer);
  if (!departmentId) return quiet("Every location on the walk is on track.");
  const board = await input.facts.operatingBoard(departmentId);
  return presentRounds(teamLocations(input.viewer, board.walkLocations));
}

export async function loadHandoff(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentId = departmentIdInScope(input.viewer);
  if (!departmentId) return quiet("The next shift has a clear handoff.");
  const [board, callOffs] = await Promise.all([
    input.facts.operatingBoard(departmentId),
    safe(() => input.facts.callOffs(departmentId), emptyCallOffs()),
  ]);
  const locations = teamLocations(input.viewer, board.board.locations);
  const scopedCallOffs = filterCallDownsToProjectedUnits(
    callOffs,
    locations.map((location) => location.location.unitId),
  );
  return presentHandoff(
    presentHandoffsFromBoard({
      board: { ...board.board, locations },
      callOffs: scopedCallOffs,
      operationContext: board.operationContext,
    }),
  );
}

export async function loadMenus(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const departmentId = departmentIdInScope(input.viewer);
  if (!departmentId) return quiet("No Menu is active.");
  const [menus, states] = await Promise.all([input.facts.menus(departmentId), input.facts.runtimeLocations()]);
  return presentMenus({
    menus,
    roomIds: states
      .filter((state) => state.identity.location.departmentId === departmentId)
      .map((state) => state.identity.location.spaceId),
  });
}

export async function loadGlance(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const { facts, viewer } = input;
  const [states, capabilities] = await Promise.all([facts.runtimeLocations(), facts.capabilities()]);
  const plantIds = facts.departmentIds.filter((id) => capabilities.get(id)?.has.has("plant.maintenance"));
  const queues = await Promise.all(plantIds.map((id) => safe(() => facts.triage(id), null)));
  const requests = queues.flatMap((queue) => queue ?? []);
  const rows: GlanceRow[] = await Promise.all(
    facts.departmentIds.map(async (departmentId) => {
      const department = viewer.departments.find((row) => row.id === departmentId);
      const operator = viewer.operators[departmentId];
      const capability = capabilities.get(departmentId);
      const [requirements, orders] = await Promise.all([
        capability?.has.has("records.canonical") ? safe(() => facts.runLogRequirements(departmentId), []) : Promise.resolve([]),
        safe(() => facts.workOrders(departmentId), []),
      ]);
      const openWorkOrders = orders.filter(
        (order) => order.presentation.status !== "COMPLETED" && order.presentation.status !== "CANCELED",
      ).length;
      const openRequests = capability?.has.has("plant.maintenance")
        ? requests.length
        : requests.filter((request) => request.requestingDepartment.id === departmentId).length;
      return {
        departmentId,
        name: department?.name ?? "Department",
        access: viewer.departmentAccess[departmentId] ?? "VIEW",
        operatingModel: operator?.operatingModel ?? "SELF_OPERATED",
        operatorName: operator?.operatorName ?? null,
        attention: attentionFromRuntimeLocations(states).filter((item) => item.departmentId === departmentId).length,
        coverageGaps: attentionFromCoverage({ departmentId, states, callDowns: null }).length,
        overdueRecords: attentionFromRecords({
          departmentId,
          engine: capability?.has.has("records.canonical") ? "CANONICAL" : "LEGACY",
          states,
          requirements,
        }).filter((item) => item.severity === "act_now").length,
        openWorkOrders,
        openRequests,
      };
    }),
  );
  return presentGlance(rows);
}

export async function loadDepartmentSetup(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  return presentDepartmentSetup({ ...(await setupInput(input)), mode: "full" }) as CardResult<DashboardReadyModel>;
}

export async function loadDepartmentSetupSummary(input: CardLoadInput): Promise<CardResult<DashboardSummaryModel>> {
  return presentDepartmentSetup({ ...(await setupInput(input)), mode: "summary" }) as CardResult<DashboardSummaryModel>;
}

async function setupInput(input: CardLoadInput) {
  const departmentId = departmentIdInScope(input.viewer);
  const capabilities = await input.facts.capabilities();
  return { reasons: departmentId ? capabilities.get(departmentId)?.notConfigured ?? [] : [] };
}

export async function loadFacilitySetup(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  return presentFacilitySetup(await input.facts.facilityReadiness());
}

export async function loadActivity(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  const extras = await input.facts.recentActivity();
  return presentActivity(extras.activity);
}

export function selectShortcuts(viewer: DashboardViewer): { id: string; title: string; href: string }[] {
  const scope = viewer.scope;
  if (!scope) return [];
  const department = scope.kind === "FACILITY" ? null : viewer.departments.find((row) => row.id === scope.departmentId);
  const context: WorkspaceContext = department
    ? {
        mode: "department",
        departmentId: department.id,
        departmentKey: department.key,
        departmentName: department.name,
      }
    : { mode: "facility", departmentId: null, departmentKey: null, departmentName: null };
  const manages =
    scope.kind === "FACILITY"
      ? viewer.scopeDepartmentIds.every((id) => viewer.departmentAccess[id] === "MANAGE")
      : viewer.departmentAccess[scope.departmentId] === "MANAGE";
  return buildQuickActions({
    supervisor: viewer.authority === "SUPERVISOR",
    context,
    config: resolveCompositionConfig(context),
  })
    .filter((action) => !HIDDEN_SHORTCUTS.has(action.id))
    .filter((action) => manages || !WRITE_SHORTCUTS.has(action.id))
    .filter((action) => isDashboardHrefAuthorized(viewer, action.href))
    .map((action) => ({ id: action.id, title: action.title, href: action.href }));
}

export async function loadShortcuts(input: CardLoadInput): Promise<CardResult<DashboardReadyModel>> {
  return presentShortcuts(selectShortcuts(input.viewer));
}
