import type { PrismaClient } from "@prisma/client";

import {
  resolveRecordEngine,
  type RecordEngineMode,
  type RecordEngineRollout,
} from "@/lib/canonical-logs/record-engine-rollout";
import { hasDietaryDomainCapabilities, hasPlantDomainCapabilities } from "@/lib/department-admission";
import {
  isDepartmentAssetOperationsEnabled,
  isDepartmentOperationalCyclesEnabled,
  isDepartmentWorkPlansEnabled,
} from "@/lib/department-operations";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import {
  departmentProductOffersMenus,
  getDepartmentProduct,
  type DepartmentProductKey,
} from "@/lib/department-products/registry";
import { isCanonicalLogsEnabled, isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { isApplicableWeekday } from "@/lib/operational-cycles/cycle-windows";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import type { DashboardViewer } from "./viewer/types";

export const DASHBOARD_CAPABILITIES = [
  "locations.runtime",
  "cycles.published",
  "work.expected",
  "coverage.planned",
  "people.roster",
  "records.canonical",
  "records.legacy",
  "maintenance.shared",
  "plant.maintenance",
  "plant.requests.filed",
  "menus",
  "meal.milestones",
] as const;

export type DashboardCapability = (typeof DASHBOARD_CAPABILITIES)[number];

export type NotConfiguredReason = {
  capability: DashboardCapability;
  message: string;
};

export type DepartmentDashboardCapabilities = {
  departmentId: string;
  departmentKey: string;
  /** Null for custom Departments. */
  productKey: DepartmentProductKey | null;
  has: ReadonlySet<DashboardCapability>;
  /** Feeds the Department setup card. */
  notConfigured: readonly NotConfiguredReason[];
};

/** Contract wording for "the engine is admitted but this is missing". */
export const NOT_CONFIGURED_MESSAGES = {
  "locations.runtime": "No locations are assigned to this Department.",
  "cycles.published": "No Operating Rhythm is published.",
  "work.expected": "No Work Plans are published.",
  "coverage.planned": "No coverage plan is set.",
  "people.roster": "No employees are in this Department.",
  "records.legacy": "This Department still uses legacy Records.",
  "plant.maintenance": "Plant is installed but not enabled for operation.",
  menus: "No Menu is assigned to this Department's locations.",
} as const satisfies Partial<Record<DashboardCapability, string>>;

type SetupCapability = Exclude<keyof typeof NOT_CONFIGURED_MESSAGES, "records.legacy">;

/**
 * Setup steps each Department type declares in the Dashboard contract. Legacy Records add a
 * reason for every Department (DSH-D19). Custom Departments have no Product declaration, so they
 * get the shared people and Work steps only.
 */
const SETUP_EXPECTATIONS: Readonly<Record<DepartmentProductKey | "CUSTOM", readonly SetupCapability[]>> = {
  HEALTHCARE_FOOD_NUTRITION: ["locations.runtime", "cycles.published", "work.expected", "coverage.planned", "menus"],
  PLANT: ["plant.maintenance"],
  EVS: [],
  CUSTOM: ["work.expected", "coverage.planned", "people.roster"],
};

/** Facts for one Department. `null` means the source failed, so the capability stays absent. */
export type DepartmentCapabilityFacts = {
  departmentId: string;
  departmentKey: string;
  plantRuntimeEnabled: boolean;
  hasRuntimeLocations: boolean | null;
  hasPublishedCycles: boolean | null;
  hasPublishedWorkPlans: boolean | null;
  hasCoveragePlan: boolean | null;
  hasRoster: boolean | null;
  recordEngine: RecordEngineMode | null;
  hasPlantRequestRoute: boolean | null;
  hasMenuApplicability: boolean | null;
};

type EngineFeature = "cycles" | "workPlans" | "asset";

/** `isDepartmentEngineEnabledForFacility` with Plant runtime resolved once per request. */
export function isDashboardEngineAdmitted(
  feature: EngineFeature,
  departmentKey: string,
  plantRuntimeEnabled: boolean,
): boolean {
  if (departmentKey === "PLANT") return plantRuntimeEnabled;
  switch (feature) {
    case "cycles":
      return isDepartmentOperationalCyclesEnabled(departmentKey);
    case "workPlans":
      return isDepartmentWorkPlansEnabled(departmentKey);
    case "asset":
      return isDepartmentAssetOperationsEnabled(departmentKey);
  }
}

export function deriveDepartmentDashboardCapabilities(
  facts: DepartmentCapabilityFacts,
): DepartmentDashboardCapabilities {
  const key = facts.departmentKey;
  const product = getDepartmentProduct(key);
  const cyclesAdmitted = isDashboardEngineAdmitted("cycles", key, facts.plantRuntimeEnabled);
  const workPlansAdmitted = isDashboardEngineAdmitted("workPlans", key, facts.plantRuntimeEnabled);
  const isPlant = hasPlantDomainCapabilities(key);

  const has = new Set<DashboardCapability>();
  if (facts.hasRuntimeLocations === true) has.add("locations.runtime");
  if (cyclesAdmitted && facts.hasPublishedCycles === true) has.add("cycles.published");
  if (workPlansAdmitted && facts.hasPublishedWorkPlans === true) has.add("work.expected");
  if (facts.hasCoveragePlan === true) has.add("coverage.planned");
  if (facts.hasRoster === true) has.add("people.roster");
  if (facts.recordEngine === "CANONICAL") has.add("records.canonical");
  if (facts.recordEngine === "LEGACY") has.add("records.legacy");
  if (isDashboardEngineAdmitted("asset", key, facts.plantRuntimeEnabled)) has.add("maintenance.shared");
  if (isPlant && facts.plantRuntimeEnabled) has.add("plant.maintenance");
  if (facts.plantRuntimeEnabled && facts.hasPlantRequestRoute === true) has.add("plant.requests.filed");
  if (departmentProductOffersMenus(key) && facts.hasMenuApplicability === true) has.add("menus");
  if (hasDietaryDomainCapabilities(key)) has.add("meal.milestones");

  const missing: Record<SetupCapability, boolean> = {
    "locations.runtime": facts.hasRuntimeLocations === false,
    "cycles.published": cyclesAdmitted && facts.hasPublishedCycles === false,
    "work.expected": workPlansAdmitted && facts.hasPublishedWorkPlans === false,
    "coverage.planned": facts.hasCoveragePlan === false,
    "people.roster": facts.hasRoster === false,
    "plant.maintenance": isPlant && !facts.plantRuntimeEnabled,
    menus: facts.hasMenuApplicability === false,
  };
  const notConfigured: NotConfiguredReason[] = SETUP_EXPECTATIONS[product?.productKey ?? "CUSTOM"]
    .filter((capability) => missing[capability])
    .map((capability) => ({ capability, message: NOT_CONFIGURED_MESSAGES[capability] }));
  if (has.has("records.legacy")) {
    notConfigured.push({ capability: "records.legacy", message: NOT_CONFIGURED_MESSAGES["records.legacy"] });
  }

  return {
    departmentId: facts.departmentId,
    departmentKey: key,
    productKey: product?.productKey ?? null,
    has,
    notConfigured,
  };
}

export type DashboardCapabilityDeps = {
  db: PrismaClient;
  plantRuntimeEnabled: boolean;
  canonicalLogsEnabled: boolean;
  operationalAssignmentsEnabled: boolean;
};

type DepartmentSet = ReadonlySet<string> | null;

/** Fail closed: a source that throws contributes nothing. */
async function departmentsWith(load: () => Promise<Iterable<string>>): Promise<DepartmentSet> {
  try {
    return new Set(await load());
  } catch {
    return null;
  }
}

function presence(set: DepartmentSet, departmentId: string): boolean | null {
  return set === null ? null : set.has(departmentId);
}

/**
 * Capabilities of each Department in the viewer's scope, for the service date.
 * One query per source for every Department, never one per Department per capability.
 */
export async function resolveDepartmentDashboardCapabilities(
  viewer: Pick<DashboardViewer, "facilityId" | "serviceDate" | "session" | "departments">,
  deps: Partial<DashboardCapabilityDeps> = {},
): Promise<Map<string, DepartmentDashboardCapabilities>> {
  const result = new Map<string, DepartmentDashboardCapabilities>();
  const departments = viewer.departments;
  if (departments.length === 0) return result;

  const db = deps.db ?? prisma;
  const facilityId = viewer.facilityId;
  const ids = departments.map((department) => department.id);
  const serviceDate = facilityLocalDateToServiceDate(viewer.serviceDate);
  const canonicalLogsEnabled = deps.canonicalLogsEnabled ?? isCanonicalLogsEnabled();
  const operationalAssignmentsEnabled = deps.operationalAssignmentsEnabled ?? isOperationalAssignmentsEnabled();
  const plantRuntimeEnabled =
    deps.plantRuntimeEnabled ?? (await isPlantRuntimeEnabled(facilityId, viewer.session).catch(() => false));
  const menuDepartmentIds = departments
    .filter((department) => departmentProductOffersMenus(department.key))
    .map((department) => department.id);

  const [locations, cycles, workPlans, coverage, roster, rollouts, requestRoutes, menus] = await Promise.all([
    departmentsWith(async () =>
      (
        await db.unitSpaceResponsibility.findMany({
          where: {
            departmentId: { in: ids },
            space: {
              facilityId,
              isActive: true,
              unit: {
                isActive: true,
                OR: [{ hierarchyRole: null }, { hierarchyRole: { not: "STAGED" } }],
              },
            },
          },
          distinct: ["departmentId"],
          select: { departmentId: true },
        })
      ).map((row) => row.departmentId),
    ),
    departmentsWith(async () =>
      (
        await db.departmentOperationalCycle.findMany({
          where: {
            facilityId,
            departmentId: { in: ids },
            nodeKind: "PERIOD",
            effectiveFrom: { lte: serviceDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: serviceDate } }],
            AND: [{ OR: [{ status: "PUBLISHED" }, { status: "RETIRED", effectiveTo: { not: null } }] }],
          },
          select: { departmentId: true, applicableDaysOfWeek: true },
        })
      )
        .filter((row) => isApplicableWeekday(row.applicableDaysOfWeek, viewer.serviceDate))
        .map((row) => row.departmentId),
    ),
    departmentsWith(async () => {
      const weekday = serviceDate.getUTCDay();
      return (
        await db.departmentWorkPlan.findMany({
          where: {
            facilityId,
            departmentId: { in: ids },
            status: "PUBLISHED",
            AND: [
              { OR: [{ effectiveStartDate: null }, { effectiveStartDate: { lte: serviceDate } }] },
              { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: serviceDate } }] },
            ],
          },
          select: { departmentId: true, weekdays: true },
        })
      )
        .filter((row) => row.weekdays.length === 0 || row.weekdays.includes(weekday))
        .map((row) => row.departmentId);
    }),
    departmentsWith(async () => {
      const [templates, assignments] = await Promise.all([
        db.operationalAssignmentTemplate.findMany({
          where: {
            facilityId,
            departmentId: { in: ids },
            status: "PUBLISHED",
            isActive: true,
            AND: [
              { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: serviceDate } }] },
              { OR: [{ effectiveTo: null }, { effectiveTo: { gte: serviceDate } }] },
            ],
          },
          distinct: ["departmentId"],
          select: { departmentId: true },
        }),
        operationalAssignmentsEnabled
          ? db.operationalAssignment.findMany({
              where: {
                facilityId,
                departmentId: { in: ids },
                serviceDate,
                status: { in: ["PLANNED", "ACTIVE"] },
              },
              distinct: ["departmentId"],
              select: { departmentId: true },
            })
          : Promise.resolve([]),
      ]);
      return [...templates, ...assignments].map((row) => row.departmentId);
    }),
    departmentsWith(async () =>
      (
        await db.department.findMany({
          where: { facilityId, id: { in: ids } },
          select: {
            id: true,
            _count: {
              select: {
                employeesAsPrimary: { where: { status: "ACTIVE" } },
                employeeDepartments: { where: { employee: { status: "ACTIVE" } } },
              },
            },
          },
        })
      )
        .filter((row) => row._count.employeesAsPrimary + row._count.employeeDepartments > 0)
        .map((row) => row.id),
    ),
    (async (): Promise<RecordEngineRollout[] | null> => {
      try {
        return await db.recordEngineRollout.findMany({
          where: { facilityId, departmentId: { in: ids } },
          orderBy: { effectiveFromServiceDate: "asc" },
          select: { facilityId: true, departmentId: true, mode: true, effectiveFromServiceDate: true },
        });
      } catch {
        return null;
      }
    })(),
    plantRuntimeEnabled
      ? departmentsWith(async () =>
          (
            await db.departmentRequestRoute.findMany({
              where: {
                facilityId,
                requestingDepartmentId: { in: ids },
                isActive: true,
                responsibleDepartment: { key: "PLANT", isActive: true },
              },
              distinct: ["requestingDepartmentId"],
              select: { requestingDepartmentId: true },
            })
          ).map((row) => row.requestingDepartmentId),
        )
      : Promise.resolve(new Set<string>()),
    menuDepartmentIds.length === 0
      ? Promise.resolve(new Set<string>())
      : departmentsWith(async () =>
          (
            await db.menu.findMany({
              where: {
                facilityId,
                departmentId: { in: menuDepartmentIds },
                status: "ACTIVE",
                locationApplicability: { some: {} },
              },
              distinct: ["departmentId"],
              select: { departmentId: true },
            })
          ).map((row) => row.departmentId),
        ),
  ]);

  for (const department of departments) {
    result.set(
      department.id,
      deriveDepartmentDashboardCapabilities({
        departmentId: department.id,
        departmentKey: department.key,
        plantRuntimeEnabled,
        hasRuntimeLocations: presence(locations, department.id),
        hasPublishedCycles: presence(cycles, department.id),
        hasPublishedWorkPlans: presence(workPlans, department.id),
        hasCoveragePlan: presence(coverage, department.id),
        hasRoster: presence(roster, department.id),
        recordEngine:
          rollouts === null
            ? null
            : resolveRecordEngine({
                capabilityEnabled: canonicalLogsEnabled,
                facilityId,
                departmentId: department.id,
                serviceDate: viewer.serviceDate,
                rollouts: rollouts.filter((row) => row.departmentId === department.id),
              }),
        hasPlantRequestRoute: presence(requestRoutes, department.id),
        hasMenuApplicability: departmentProductOffersMenus(department.key)
          ? presence(menus, department.id)
          : null,
      }),
    );
  }
  return result;
}
