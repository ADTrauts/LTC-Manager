import { isPartnerFacilitySession, type FacilitySession } from "@/lib/auth";
import { isMenuInfrastructureUnavailableError } from "@/lib/menu-db";
import { listDepartmentsNeedingHead } from "@/lib/department-authority/heads";
import { loadOperatingLocationBoard, type LoadedOperatingLocationBoard } from "@/lib/todays-work/operating-locations/load";
import type { SupervisorAssetExceptionItem } from "@/lib/asset-operations/load-runtime-assets";
import { loadSupervisorAssetExceptions } from "@/lib/asset-operations/load-runtime-assets";
import { listWorkOrders } from "@/lib/asset-operations/work-order-service";
import {
  loadWorkspaceNonOperationalExtras,
  type WorkspaceNonOperationalExtras,
} from "@/lib/dashboard/activity";
import { loadFacilityRunLogRequirements } from "@/lib/canonical-logs/load-run-requirements";
import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import { collectActionableLandingSpaces, loadLocationsView } from "@/lib/locations";
import { loadGmCycleSummary, type GmCycleSummary } from "@/lib/operational-cycles/load-gm-cycle-summary";
import { loadDepartmentRunPresentation } from "@/lib/operational-cycles/load-run-operation-presentation";
import type { RunDepartmentOperationPresentation } from "@/lib/operational-cycles/present-run-operation";
import { resolvePlantOperationsAuthority } from "@/lib/operational-requests/authority";
import { listPlantTriageQueue } from "@/lib/operational-requests/request-service";
import { TRIAGE_ELIGIBLE_STATUSES } from "@/lib/operational-requests/types";
import { loadPmRunBoard } from "@/lib/preventive-maintenance/run-load";
import { prisma } from "@/lib/prisma";
import { loadRuntimeLocationStates, type RuntimeLocationState } from "@/lib/runtime-location-state";
import { loadSupervisorDailyCoverage } from "@/lib/scheduling/load-supervisor-daily-coverage";
import type { SupervisorDailyCoverageProjection } from "@/lib/scheduling/supervisor-daily-coverage";
import type { CallDownData } from "@/lib/scheduling/call-down";
import { loadTodaysExpectedWork } from "@/lib/work/expected/load-expected-work";
import type { TodaysExpectedWorkView } from "@/lib/work/expected/types";
import { loadPresenceCallOffs } from "@/lib/scheduling/load-presence-call-offs";
import {
  presentOperationalReviewDay,
  type OperationalReviewDayPresentation,
} from "@/lib/operational-review/present-operational-review-day";
import { cachedOperationalReviewDay, previousServiceDateKey } from "@/lib/operational-review/review-day-cache";

import type { PlantTriageRequestFact } from "./attention-mappers/plant-requests";
import { resolveDepartmentDashboardCapabilities, type DepartmentDashboardCapabilities } from "./capabilities";
import type { DashboardViewer } from "./viewer/types";

export type DashboardMenuFact = {
  id: string;
  name: string;
  spaceIds: readonly string[];
  locationCount: number;
  cycleCount: number;
};

export type DashboardMenuFacts = {
  menus: readonly DashboardMenuFact[];
  unavailable: string | null;
};

export type DashboardFacilityReadiness = {
  needingHead: readonly { id: string; name: string }[];
  unassignedPeople: number;
  locations: number;
  rooms: number;
};

export type DashboardFactSources = {
  db: typeof prisma;
  now: () => Date;
  loadLocationsView: typeof loadLocationsView;
  collectActionableLandingSpaces: typeof collectActionableLandingSpaces;
  loadRuntimeLocationStates: typeof loadRuntimeLocationStates;
  loadDepartmentRunPresentation: typeof loadDepartmentRunPresentation;
  loadGmCycleSummary: typeof loadGmCycleSummary;
  loadTodaysExpectedWork: typeof loadTodaysExpectedWork;
  loadSupervisorDailyCoverage: typeof loadSupervisorDailyCoverage;
  loadPresenceCallOffs: typeof loadPresenceCallOffs;
  loadSupervisorAssetExceptions: typeof loadSupervisorAssetExceptions;
  listWorkOrders: typeof listWorkOrders;
  loadPmRunBoard: typeof loadPmRunBoard;
  resolvePlantOperationsAuthority: typeof resolvePlantOperationsAuthority;
  listPlantTriageQueue: typeof listPlantTriageQueue;
  loadFacilityRunLogRequirements: typeof loadFacilityRunLogRequirements;
  loadWorkspaceNonOperationalExtras: typeof loadWorkspaceNonOperationalExtras;
  loadOperatingLocationBoard: typeof loadOperatingLocationBoard;
  listDepartmentsNeedingHead: typeof listDepartmentsNeedingHead;
  resolveDepartmentDashboardCapabilities: typeof resolveDepartmentDashboardCapabilities;
};

const DEFAULT_SOURCES: DashboardFactSources = {
  db: prisma,
  now: () => new Date(),
  loadLocationsView,
  collectActionableLandingSpaces,
  loadRuntimeLocationStates,
  loadDepartmentRunPresentation,
  loadGmCycleSummary,
  loadTodaysExpectedWork,
  loadSupervisorDailyCoverage,
  loadPresenceCallOffs,
  loadSupervisorAssetExceptions,
  listWorkOrders,
  loadPmRunBoard,
  resolvePlantOperationsAuthority,
  listPlantTriageQueue,
  loadFacilityRunLogRequirements,
  loadWorkspaceNonOperationalExtras,
  loadOperatingLocationBoard,
  listDepartmentsNeedingHead,
  resolveDepartmentDashboardCapabilities,
};

type Loaded<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

/**
 * Request-scoped facts shared by every card. Each getter runs its loader at most once per pack
 * and only for Departments the current scope covers.
 */
export type DashboardFactPack = {
  readonly viewer: DashboardViewer;
  readonly now: Date;
  /** Departments the current scope covers, in facility sort order. */
  readonly departmentIds: readonly string[];
  /** Runtime Location State for the scope's actionable locations; Team scope keeps its rooms only. */
  runtimeLocations(): Promise<readonly RuntimeLocationState[]>;
  /** Loading the run presentation records today's Key Time rows, as on every RUN surface. */
  runPresentation(departmentId: string): Promise<RunDepartmentOperationPresentation | null>;
  cycleSummary(departmentId: string): Promise<GmCycleSummary | null>;
  expectedWork(departmentId: string): Promise<TodaysExpectedWorkView>;
  dailyCoverage(departmentId: string): Promise<SupervisorDailyCoverageProjection>;
  callOffs(departmentId: string): Promise<CallDownData>;
  assetExceptions(departmentId: string): Promise<SupervisorAssetExceptionItem[]>;
  workOrders(departmentId: string): Promise<Loaded<typeof listWorkOrders>>;
  pmBoard(departmentId: string): Promise<Loaded<typeof loadPmRunBoard>>;
  /** Null when this viewer cannot triage for the Plant Department. */
  triage(plantDepartmentId: string): Promise<PlantTriageRequestFact[] | null>;
  runLogRequirements(departmentId: string): Promise<readonly RunLogRequirementView[]>;
  /** Last seven days of non-operational activity for the scope's Departments, without legacy inspections. */
  recentActivity(): Promise<WorkspaceNonOperationalExtras>;
  /** Yesterday's review for one Department, cached for that service date. */
  reviewDay(departmentId: string): Promise<OperationalReviewDayPresentation>;
  /** Today's Work operating board for rounds and handoff. */
  operatingBoard(departmentId: string): Promise<LoadedOperatingLocationBoard>;
  /** Active Menus, with the locations and cycles each one is assigned to. */
  menus(departmentId: string): Promise<DashboardMenuFacts>;
  /** Capability map, including setup reasons for Department setup. */
  capabilities(): Promise<ReadonlyMap<string, DepartmentDashboardCapabilities>>;
  facilityReadiness(): Promise<DashboardFacilityReadiness>;
};

export function scopeDepartmentIdsFor(viewer: Pick<DashboardViewer, "scope" | "scopeDepartmentIds">): string[] {
  const scope = viewer.scope;
  if (!scope) return [];
  if (scope.kind === "FACILITY") return [...viewer.scopeDepartmentIds];
  return viewer.scopeDepartmentIds.includes(scope.departmentId) ? [scope.departmentId] : [];
}

export function createDashboardFactPack(
  viewer: DashboardViewer,
  overrides: Partial<DashboardFactSources> = {},
): DashboardFactPack {
  const sources: DashboardFactSources = { ...DEFAULT_SOURCES, ...overrides };
  const now = sources.now();
  const departmentIds = scopeDepartmentIdsFor(viewer);
  const inScope = new Set(departmentIds);
  const memo = new Map<string, Promise<unknown>>();
  const session = viewer.session;
  function facilitySession(): FacilitySession {
    if (!isPartnerFacilitySession(session)) return session;
    // Loaders require a facility role. The partner's Departments stay limited by `scoped`.
    return { ...session, role: viewer.role, accessKind: undefined } as FacilitySession;
  }
  const facilityId = viewer.facilityId;
  const teamRoomIds =
    viewer.scope?.kind === "TEAM" ? { departmentId: viewer.scope.departmentId, rooms: new Set(viewer.scope.roomIds) } : null;

  function once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = memo.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = load();
      memo.set(key, pending);
    }
    return pending;
  }

  function scoped<T>(name: string, departmentId: string, load: () => Promise<T>): Promise<T> {
    if (!inScope.has(departmentId)) {
      return Promise.reject(new Error(`Dashboard fact "${name}" requested outside the viewer's scope.`));
    }
    return once(`${name}:${departmentId}`, load);
  }

  function spaceFilterFor(departmentId: string): ReadonlySet<string> | undefined {
    return teamRoomIds && teamRoomIds.departmentId === departmentId ? teamRoomIds.rooms : undefined;
  }

  async function loadRuntimeLocations(): Promise<readonly RuntimeLocationState[]> {
    const scope = viewer.scope;
    if (!scope || departmentIds.length === 0) return [];
    const scopeDepartment =
      scope.kind === "FACILITY" ? null : viewer.departments.find((row) => row.id === scope.departmentId);
    if (scope.kind !== "FACILITY" && !scopeDepartment) return [];
    const locations = await sources.loadLocationsView(facilitySession(), {
      lensOverride: scopeDepartment
        ? { mode: "DEPARTMENT", departmentId: scopeDepartment.id, departmentKey: scopeDepartment.key }
        : { mode: "FACILITY" },
    });
    if (!locations.view) return [];
    const refs = sources
      .collectActionableLandingSpaces(locations.view)
      .refs.filter((ref) => inScope.has(ref.departmentId))
      .filter((ref) => {
        const rooms = spaceFilterFor(ref.departmentId);
        return !rooms || rooms.has(ref.spaceId);
      });
    if (refs.length === 0) return [];
    const loaded = await sources.loadRuntimeLocationStates({ facilityId, spaceRefs: refs, now });
    return loaded.states;
  }

  const pack: DashboardFactPack = {
    viewer,
    now,
    departmentIds,
    runtimeLocations: () => once("runtimeLocations", loadRuntimeLocations),
    runPresentation: (departmentId) =>
      scoped("runPresentation", departmentId, () =>
        sources.loadDepartmentRunPresentation({
          session: facilitySession(),
          facilityId,
          departmentId,
          now,
          spaceIdFilter: spaceFilterFor(departmentId),
        }),
      ),
    cycleSummary: (departmentId) =>
      scoped("cycleSummary", departmentId, () =>
        sources.loadGmCycleSummary({ session: facilitySession(), facilityId, departmentId, now }),
      ),
    expectedWork: (departmentId) =>
      scoped("expectedWork", departmentId, async () =>
        sources.loadTodaysExpectedWork({
          session: facilitySession(),
          facilityId,
          departmentId,
          runPresentation: await pack.runPresentation(departmentId),
          now,
        }),
      ),
    dailyCoverage: (departmentId) =>
      scoped("dailyCoverage", departmentId, () =>
        sources.loadSupervisorDailyCoverage({
          facilityId,
          departmentId,
          serviceDate: viewer.serviceDate,
          session: facilitySession(),
          now,
        }),
      ),
    callOffs: (departmentId) =>
      scoped("callOffs", departmentId, () => sources.loadPresenceCallOffs(facilityId, { departmentId })),
    assetExceptions: (departmentId) =>
      scoped("assetExceptions", departmentId, () =>
        sources.loadSupervisorAssetExceptions(facilityId, departmentId),
      ),
    workOrders: (departmentId) =>
      scoped("workOrders", departmentId, () =>
        sources.listWorkOrders(facilitySession(), { facilityId, departmentId, client: sources.db }),
      ),
    pmBoard: (departmentId) =>
      scoped("pmBoard", departmentId, () =>
        sources.loadPmRunBoard(facilitySession(), { facilityId, departmentId, now, client: sources.db }),
      ),
    triage: (plantDepartmentId) =>
      scoped("triage", plantDepartmentId, async () => {
        const authority = await sources.resolvePlantOperationsAuthority(facilitySession(), facilityId, plantDepartmentId);
        if (!authority.canTriage) return null;
        return sources.listPlantTriageQueue({
          facilityId,
          plantDepartmentId,
          status: TRIAGE_ELIGIBLE_STATUSES,
        });
      }),
    runLogRequirements: (departmentId) =>
      scoped("runLogRequirements", departmentId, async () => {
        const loaded = await sources.loadFacilityRunLogRequirements({
          client: sources.db,
          session: facilitySession(),
          facilityId,
          departmentId,
          now,
        });
        return loaded.requirements;
      }),
    recentActivity: () =>
      once("recentActivity", () =>
        sources.loadWorkspaceNonOperationalExtras({
          facilityId,
          departmentIds,
          includeLegacyInspections: false,
        }),
      ),
    reviewDay: (departmentId) =>
      scoped("reviewDay", departmentId, async () => {
        const loaded = await cachedOperationalReviewDay({
          client: sources.db,
          facilityId,
          departmentId,
          serviceDate: previousServiceDateKey(viewer.serviceDate),
          now,
        });
        return presentOperationalReviewDay(loaded.model, { todayKey: viewer.serviceDate });
      }),
    operatingBoard: (departmentId) =>
      scoped("operatingBoard", departmentId, () => {
        const department = viewer.departments.find((row) => row.id === departmentId);
        return sources.loadOperatingLocationBoard(facilityId, {
          session: facilitySession(),
          activeDepartmentId: departmentId,
          activeDepartmentKey: department?.key ?? null,
        });
      }),
    menus: (departmentId) =>
      scoped("menus", departmentId, () => loadMenuFacts(sources.db, facilityId, departmentId)),
    capabilities: () => once("capabilities", () => sources.resolveDepartmentDashboardCapabilities(viewer)),
    facilityReadiness: () => once("facilityReadiness", () => loadFacilityReadiness(sources, facilityId, now)),
  };
  return pack;
}

async function loadMenuFacts(
  db: typeof prisma,
  facilityId: string,
  departmentId: string,
): Promise<DashboardMenuFacts> {
  try {
    const rows = await db.menu.findMany({
      where: { facilityId, departmentId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        locationApplicability: { select: { spaceId: true, unitId: true } },
        operationalCycleApplicability: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    });
    return {
      menus: rows.map((row) => ({
        id: row.id,
        name: row.name,
        spaceIds: row.locationApplicability.map((location) => location.spaceId).filter((id): id is string => Boolean(id)),
        locationCount: row.locationApplicability.length,
        cycleCount: row.operationalCycleApplicability.length,
      })),
      unavailable: null,
    };
  } catch (error) {
    if (isMenuInfrastructureUnavailableError(error)) {
      return { menus: [], unavailable: "Menus are not available in this database yet." };
    }
    throw error;
  }
}

async function loadFacilityReadiness(
  sources: DashboardFactSources,
  facilityId: string,
  now: Date,
): Promise<DashboardFacilityReadiness> {
  const [needingHead, unassignedPeople, locations, rooms] = await Promise.all([
    sources.listDepartmentsNeedingHead(sources.db, { facilityId, now }),
    sources.db.employee.count({
      where: {
        facilityId,
        status: "ACTIVE",
        primaryDepartmentId: null,
        employeeDepartments: { none: {} },
      },
    }),
    sources.db.unit.count({ where: { facilityId, isActive: true } }),
    sources.db.unitSpace.count({ where: { facilityId, isActive: true } }),
  ]);
  return {
    needingHead: needingHead.map((department) => ({ id: department.departmentId, name: department.name })),
    unassignedPeople,
    locations,
    rooms,
  };
}
