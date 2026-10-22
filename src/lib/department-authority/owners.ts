import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Owning Department of a record (CDA ARCHITECTURE §4).
 * - `workforce`: a workforce record belongs to each of its Departments; the action decides which one it changes.
 * - `sharedFacility`: no Department owns it (legacy template or definition without a Department).
 * - `unowned`: the record has no owning Department recorded (unassigned asset, legacy repair).
 */
export type DepartmentOwner =
  | { kind: "department"; departmentId: string }
  | { kind: "workforce"; primaryDepartmentId: string | null; departmentIds: string[] }
  | { kind: "sharedFacility" }
  | { kind: "unowned" };

export type DepartmentOwnerInput = { facilityId: string; id: string };

type OwnerResolver = (db: DbClient, input: DepartmentOwnerInput) => Promise<DepartmentOwner | null>;

const FOOD_AND_NUTRITION_DEPARTMENT_KEY = "DIETARY";

function owned(row: { departmentId: string } | null): DepartmentOwner | null {
  return row ? { kind: "department", departmentId: row.departmentId } : null;
}

function ownedOr(
  row: { departmentId: string | null } | null,
  fallback: DepartmentOwner,
): DepartmentOwner | null {
  if (!row) return null;
  return row.departmentId ? { kind: "department", departmentId: row.departmentId } : fallback;
}

const departmentIdSelect = { departmentId: true } as const;

export const DEPARTMENT_OWNER_RESOLVERS = {
  /** The Department itself, for writes that name it directly (create, report, install). */
  department: async (db, { facilityId, id }) => {
    const row = await db.department.findFirst({ where: { id, facilityId }, select: { id: true } });
    return row ? { kind: "department", departmentId: row.id } : null;
  },

  workforceRecord: async (db, { facilityId, id }) => {
    const row = await db.employee.findFirst({
      where: { id, facilityId },
      select: { primaryDepartmentId: true, employeeDepartments: { select: { departmentId: true } } },
    });
    if (!row) return null;
    const departmentIds = new Set<string>();
    if (row.primaryDepartmentId) departmentIds.add(row.primaryDepartmentId);
    for (const membership of row.employeeDepartments) departmentIds.add(membership.departmentId);
    return { kind: "workforce", primaryDepartmentId: row.primaryDepartmentId, departmentIds: [...departmentIds] };
  },

  jobRole: async (db, { facilityId, id }) =>
    owned(await db.departmentJobRole.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  /** Shift. Legacy entries without a Department are judged by the employee's primary Department. */
  scheduleEntry: async (db, { facilityId, id }) => {
    const row = await db.scheduleEntry.findFirst({
      where: { id, employee: { facilityId } },
      select: { departmentId: true, employee: { select: { primaryDepartmentId: true } } },
    });
    if (!row) return null;
    const departmentId = row.departmentId ?? row.employee.primaryDepartmentId;
    return departmentId ? { kind: "department", departmentId } : { kind: "unowned" };
  },

  /** Legacy call-off / move override: the employee's primary Department. */
  callOffOverride: async (db, { facilityId, id }) => {
    const row = await db.assignmentOverride.findFirst({
      where: { id, employee: { facilityId } },
      select: { employee: { select: { primaryDepartmentId: true } } },
    });
    if (!row) return null;
    const departmentId = row.employee.primaryDepartmentId;
    return departmentId ? { kind: "department", departmentId } : { kind: "unowned" };
  },

  operationalAssignment: async (db, { facilityId, id }) =>
    owned(await db.operationalAssignment.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  assignmentPlan: async (db, { facilityId, id }) =>
    owned(await db.operationalAssignmentPlan.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  /** Coverage expectation and assignment template share `OperationalAssignmentTemplate`. */
  assignmentTemplate: async (db, { facilityId, id }) =>
    owned(
      await db.operationalAssignmentTemplate.findFirst({ where: { id, facilityId }, select: departmentIdSelect }),
    ),

  departmentZone: async (db, { facilityId, id }) =>
    owned(await db.departmentOperationalZone.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  operationalCycle: async (db, { facilityId, id }) =>
    owned(await db.departmentOperationalCycle.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  cycleDayExpectation: async (db, { facilityId, id }) =>
    owned(
      await db.operationalCycleDayExpectation.findFirst({ where: { id, facilityId }, select: departmentIdSelect }),
    ),

  keyTimeDayExpectation: async (db, { facilityId, id }) =>
    owned(
      await db.operationalCycleKeyTimeDayExpectation.findFirst({
        where: { id, facilityId },
        select: departmentIdSelect,
      }),
    ),

  locationFunctionProfile: async (db, { facilityId, id }) =>
    owned(
      await db.departmentOperationalProfile.findFirst({ where: { id, facilityId }, select: departmentIdSelect }),
    ),

  /** Room type inside a Location Function profile: the profile's Department. */
  roomArchetype: async (db, { facilityId, id }) => {
    const row = await db.departmentRoomArchetype.findFirst({
      where: { id, profile: { facilityId } },
      select: { profile: { select: departmentIdSelect } },
    });
    return owned(row?.profile ?? null);
  },

  roomBinding: async (db, { facilityId, id }) => {
    const row = await db.departmentRoomArchetypeBinding.findFirst({
      where: { id, profile: { facilityId } },
      select: { profile: { select: departmentIdSelect } },
    });
    return owned(row?.profile ?? null);
  },

  departmentTeam: async (db, { facilityId, id }) =>
    owned(await db.departmentTeam.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  departmentTeamCycle: async (db, { facilityId, id }) =>
    owned(await db.departmentTeamCycle.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  workPlan: async (db, { facilityId, id }) =>
    owned(await db.departmentWorkPlan.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  workOccurrence: async (db, { facilityId, id }) =>
    owned(await db.departmentWorkOccurrence.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  menu: async (db, { facilityId, id }) =>
    owned(await db.menu.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  logAttachment: async (db, { facilityId, id }) =>
    owned(await db.logAttachment.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  logTypeDefault: async (db, { facilityId, id }) =>
    owned(
      await db.departmentFacilityTypeLogDefault.findFirst({ where: { id, facilityId }, select: departmentIdSelect }),
    ),

  logSuppression: async (db, { facilityId, id }) =>
    owned(
      await db.departmentLocationLogSuppression.findFirst({
        where: { id, space: { facilityId } },
        select: departmentIdSelect,
      }),
    ),

  evidenceTemplate: async (db, { facilityId, id }) =>
    owned(await db.operationalTemplate.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  evidenceRecord: async (db, { facilityId, id }) =>
    owned(
      await db.operationalEvidenceRecord.findFirst({ where: { id, facilityId }, select: departmentIdSelect }),
    ),

  recordWaiver: async (db, { facilityId, id }) =>
    owned(await db.operationalRecordWaiver.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  /** Legacy `/logs` template (class Legacy). Without a Department it is shared facility. */
  legacyLogTemplate: async (db, { facilityId, id }) =>
    ownedOr(await db.logTemplate.findFirst({ where: { id, facilityId }, select: departmentIdSelect }), {
      kind: "sharedFacility",
    }),

  /** Request to another Department: the responsible Department. */
  operationalRequest: async (db, { facilityId, id }) => {
    const row = await db.operationalRequest.findFirst({
      where: { id, facilityId },
      select: { responsibleDepartmentId: true },
    });
    return row ? { kind: "department", departmentId: row.responsibleDepartmentId } : null;
  },

  requestRoute: async (db, { facilityId, id }) => {
    const row = await db.departmentRequestRoute.findFirst({
      where: { id, facilityId },
      select: { responsibleDepartmentId: true },
    });
    return row ? { kind: "department", departmentId: row.responsibleDepartmentId } : null;
  },

  /** Repair or work order: the responsible Department. The asset-maintainer rule arrives with CDA-D18. */
  repair: async (db, { facilityId, id }) => {
    const row = await db.repair.findFirst({
      where: { id, unit: { facilityId } },
      select: { responsibleDepartmentId: true },
    });
    if (!row) return null;
    return row.responsibleDepartmentId
      ? { kind: "department", departmentId: row.responsibleDepartmentId }
      : { kind: "unowned" };
  },

  /** Asset identity: the using Department. */
  asset: async (db, { facilityId, id }) =>
    ownedOr(await db.asset.findFirst({ where: { id, unit: { facilityId } }, select: departmentIdSelect }), {
      kind: "unowned",
    }),

  assetIssue: async (db, { facilityId, id }) =>
    owned(await db.assetIssue.findFirst({ where: { id, facilityId }, select: departmentIdSelect })),

  /** Preventive maintenance plans are Plant's. The plan records the Plant Department. */
  pmPlan: async (db, { facilityId, id }) =>
    owned(
      await db.preventiveMaintenancePlan.findFirst({ where: { id, facilityId }, select: departmentIdSelect }),
    ),

  pmOccurrence: async (db, { facilityId, id }) => {
    const row = await db.preventiveMaintenanceOccurrence.findFirst({
      where: { id, plan: { facilityId } },
      select: { plan: { select: departmentIdSelect } },
    });
    return owned(row?.plan ?? null);
  },

  inspectionDefinition: async (db, { facilityId, id }) =>
    ownedOr(await db.inspectionDefinition.findFirst({ where: { id, facilityId }, select: departmentIdSelect }), {
      kind: "sharedFacility",
    }),

  knowledgeArticle: async (db, { facilityId, id }) =>
    ownedOr(await db.knowledgeArticle.findFirst({ where: { id, facilityId }, select: departmentIdSelect }), {
      kind: "sharedFacility",
    }),

  /** Servery milestones are Food & Nutrition's. `id` is the servery Unit. */
  serveryMilestone: async (db, { facilityId, id }) => {
    const unit = await db.unit.findFirst({ where: { id, facilityId }, select: { id: true } });
    if (!unit) return null;
    const department = await db.department.findFirst({
      where: { facilityId, key: FOOD_AND_NUTRITION_DEPARTMENT_KEY, isActive: true },
      select: { id: true },
    });
    return department ? { kind: "department", departmentId: department.id } : { kind: "unowned" };
  },
} satisfies Record<string, OwnerResolver>;

export type DepartmentOwnerKind = keyof typeof DEPARTMENT_OWNER_RESOLVERS;

export const DEPARTMENT_OWNER_KINDS = Object.keys(DEPARTMENT_OWNER_RESOLVERS) as DepartmentOwnerKind[];

/** Null when the record is not part of the facility. */
export function resolveDepartmentOwner(
  db: DbClient,
  kind: DepartmentOwnerKind,
  input: DepartmentOwnerInput,
): Promise<DepartmentOwner | null> {
  return DEPARTMENT_OWNER_RESOLVERS[kind](db, input);
}
