import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

import {
  assertNoOverlaps,
  dayBefore,
  deriveOperatingModel,
  findPeriodForDate,
  operatingModelLabel,
  organizationDisplayLabel,
  periodCoversDate,
  periodsOverlap,
  DepartmentOperatorError,
} from "@/lib/department-operators";
import {
  assignDepartmentOperator,
  cancelFutureDepartmentOperatorChange,
  ensureInitialDepartmentOperator,
  loadDepartmentOperatorOnDate,
} from "@/lib/department-operators/service";

test("deriveOperatingModel: same org is facility operated", () => {
  assert.equal(
    deriveOperatingModel({
      operatorOrganizationId: "org_ecmc",
      facilityOrganizationId: "org_ecmc",
    }),
    "FACILITY_OPERATED",
  );
  assert.equal(operatingModelLabel("FACILITY_OPERATED"), "Facility operated");
});

test("deriveOperatingModel: different org is contracted", () => {
  assert.equal(
    deriveOperatingModel({
      operatorOrganizationId: "org_metz",
      facilityOrganizationId: "org_ecmc",
    }),
    "CONTRACTED",
  );
  assert.equal(operatingModelLabel("CONTRACTED"), "Contracted");
});

test("organizationDisplayLabel prefers displayName", () => {
  assert.equal(
    organizationDisplayLabel({ name: "Metz LLC", displayName: "Metz Culinary Management" }),
    "Metz Culinary Management",
  );
  assert.equal(organizationDisplayLabel({ name: "ECMC", displayName: null }), "ECMC");
});

test("periodCoversDate is inclusive on both ends", () => {
  const period = {
    effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
    effectiveTo: facilityLocalDateToServiceDate("2028-06-30"),
  };
  assert.equal(periodCoversDate(period, facilityLocalDateToServiceDate("2024-01-01")), true);
  assert.equal(periodCoversDate(period, facilityLocalDateToServiceDate("2028-06-30")), true);
  assert.equal(periodCoversDate(period, facilityLocalDateToServiceDate("2028-07-01")), false);
  assert.equal(periodCoversDate(period, facilityLocalDateToServiceDate("2023-12-31")), false);
});

test("open-ended period covers current and future until closed", () => {
  const period = {
    effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
    effectiveTo: null,
  };
  assert.equal(periodCoversDate(period, facilityLocalDateToServiceDate("2026-10-07")), true);
  assert.equal(periodCoversDate(period, facilityLocalDateToServiceDate("2027-01-01")), true);
});

test("periodsOverlap rejects overlapping active ranges", () => {
  assert.equal(
    periodsOverlap(
      {
        effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
        effectiveTo: null,
      },
      {
        effectiveFrom: facilityLocalDateToServiceDate("2027-01-01"),
        effectiveTo: null,
      },
    ),
    true,
  );
  assert.equal(
    periodsOverlap(
      {
        effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
        effectiveTo: facilityLocalDateToServiceDate("2026-12-31"),
      },
      {
        effectiveFrom: facilityLocalDateToServiceDate("2027-01-01"),
        effectiveTo: null,
      },
    ),
    false,
  );
});

test("assertNoOverlaps throws on collision", () => {
  assert.throws(
    () =>
      assertNoOverlaps([
        {
          effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
          effectiveTo: null,
        },
        {
          effectiveFrom: facilityLocalDateToServiceDate("2025-01-01"),
          effectiveTo: null,
        },
      ]),
    /only one operating Organization/,
  );
});

test("dayBefore follows @db.Date UTC midnight convention", () => {
  assert.equal(
    dayBefore(facilityLocalDateToServiceDate("2027-01-01")).toISOString().slice(0, 10),
    "2026-12-31",
  );
});

test("findPeriodForDate resolves historical and current", () => {
  const history = [
    {
      id: "metz",
      effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
      effectiveTo: facilityLocalDateToServiceDate("2026-12-31"),
    },
    {
      id: "sodexo",
      effectiveFrom: facilityLocalDateToServiceDate("2027-01-01"),
      effectiveTo: null,
    },
  ];
  assert.equal(
    findPeriodForDate(history, facilityLocalDateToServiceDate("2026-06-01"))?.id,
    "metz",
  );
  assert.equal(
    findPeriodForDate(history, facilityLocalDateToServiceDate("2027-01-01"))?.id,
    "sodexo",
  );
  assert.equal(
    findPeriodForDate(history, facilityLocalDateToServiceDate("2023-01-01")),
    null,
  );
});

type OperatorRelRow = {
  id: string;
  departmentId: string;
  organizationId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes?: string | null;
  externalAccountCode?: string | null;
  contractReference?: string | null;
  createdByUserId?: string | null;
};

type OperatorDb = {
  department: {
    findFirst: (args: {
      where: { id: string; facilityId: string };
    }) => Promise<{
      id: string;
      facilityId: string;
      facility: { organizationId: string; timezone: string };
    } | null>;
  };
  organization: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<{
      id: string;
      name: string;
      displayName: string | null;
      legalName: null;
      organizationType: string;
      isActive: boolean;
    } | null>;
  };
  departmentOperatorRelationship: {
    findMany: (args: {
      where: { departmentId: string; id?: { in: string[] } };
      orderBy?: unknown;
      include?: unknown;
      select?: unknown;
    }) => Promise<Array<Record<string, unknown>>>;
    findFirst: (args: {
      where: {
        departmentId?: string;
        id?: string | { not: string };
        effectiveTo?: Date;
      };
      orderBy?: unknown;
      select?: unknown;
    }) => Promise<Record<string, unknown> | null>;
    create: (args: {
      data: {
        departmentId: string;
        organizationId: string;
        effectiveFrom: Date;
        effectiveTo: Date | null;
        notes?: string | null;
        externalAccountCode?: string | null;
        contractReference?: string | null;
        createdByUserId?: string | null;
      };
      include?: unknown;
    }) => Promise<Record<string, unknown>>;
    update: (args: {
      where: { id: string };
      data: { effectiveTo?: Date | null };
    }) => Promise<OperatorRelRow>;
    delete: (args: { where: { id: string } }) => Promise<void>;
    deleteMany: (args: {
      where: { id: { in: string[] }; departmentId: string };
    }) => Promise<void>;
  };
  $transaction: <T>(fn: (tx: OperatorDb) => Promise<T>) => Promise<T>;
  _relationships: OperatorRelRow[];
};

function makeOperatorDb(state: {
  departmentId: string;
  facilityId: string;
  facilityOrganizationId: string;
  timezone?: string;
  organizations: Array<{
    id: string;
    name: string;
    displayName?: string | null;
    isActive?: boolean;
  }>;
  relationships: OperatorRelRow[];
}): OperatorDb {
  let seq = 0;
  const relationships: OperatorRelRow[] = [...state.relationships];
  const orgById = new Map(state.organizations.map((o) => [o.id, o]));

  const db: OperatorDb = {
    department: {
      findFirst: async ({ where }) => {
        if (where.id !== state.departmentId || where.facilityId !== state.facilityId) {
          return null;
        }
        return {
          id: state.departmentId,
          facilityId: state.facilityId,
          facility: {
            organizationId: state.facilityOrganizationId,
            timezone: state.timezone ?? "America/New_York",
          },
        };
      },
    },
    organization: {
      findUnique: async ({ where }) => {
        const row = orgById.get(where.id);
        if (!row) return null;
        return {
          id: row.id,
          name: row.name,
          displayName: row.displayName ?? row.name,
          legalName: null,
          organizationType: "MANAGEMENT_COMPANY",
          isActive: row.isActive ?? true,
        };
      },
    },
    departmentOperatorRelationship: {
      findMany: async ({ where }) => {
        let rows = relationships.filter((r) => r.departmentId === where.departmentId);
        if (where.id?.in) {
          const ids = where.id.in;
          rows = rows.filter((r) => ids.includes(r.id));
        }
        return rows
          .slice()
          .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())
          .map((row) => ({
            ...row,
            notes: row.notes ?? null,
            externalAccountCode: row.externalAccountCode ?? null,
            contractReference: row.contractReference ?? null,
            createdByUserId: row.createdByUserId ?? null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            organization: {
              id: row.organizationId,
              name: orgById.get(row.organizationId)?.name ?? row.organizationId,
              displayName: orgById.get(row.organizationId)?.displayName ?? null,
              legalName: null,
              organizationType: "MANAGEMENT_COMPANY",
              isActive: true,
            },
          }));
      },
      findFirst: async ({ where }) => {
        let rows = relationships;
        if (where.departmentId) {
          rows = rows.filter((r) => r.departmentId === where.departmentId);
        }
        if (typeof where.id === "string") {
          const id = where.id;
          rows = rows.filter((r) => r.id === id);
        } else if (where.id && typeof where.id === "object" && "not" in where.id) {
          const excluded = where.id.not;
          rows = rows.filter((r) => r.id !== excluded);
        }
        if (where.effectiveTo) {
          const effectiveTo = where.effectiveTo;
          rows = rows.filter(
            (r) => r.effectiveTo && r.effectiveTo.getTime() === effectiveTo.getTime(),
          );
        }
        return rows[0]
          ? {
              ...rows[0],
              notes: null,
              externalAccountCode: null,
              contractReference: null,
              createdByUserId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null;
      },
      create: async ({ data }) => {
        seq += 1;
        const created: OperatorRelRow = {
          id: `rel_${seq}`,
          departmentId: data.departmentId,
          organizationId: data.organizationId,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo,
          notes: data.notes ?? null,
          externalAccountCode: data.externalAccountCode ?? null,
          contractReference: data.contractReference ?? null,
          createdByUserId: data.createdByUserId ?? null,
        };
        relationships.push(created);
        return {
          ...created,
          createdAt: new Date(),
          updatedAt: new Date(),
          organization: {
            id: data.organizationId,
            name: orgById.get(data.organizationId)?.name ?? data.organizationId,
            displayName: orgById.get(data.organizationId)?.displayName ?? null,
            legalName: null,
            organizationType: "MANAGEMENT_COMPANY",
            isActive: true,
          },
        };
      },
      update: async ({ where, data }) => {
        const row = relationships.find((r) => r.id === where.id);
        if (!row) throw new Error("missing");
        if (data.effectiveTo !== undefined) row.effectiveTo = data.effectiveTo;
        return row;
      },
      delete: async ({ where }) => {
        const idx = relationships.findIndex((r) => r.id === where.id);
        if (idx >= 0) relationships.splice(idx, 1);
      },
      deleteMany: async ({ where }) => {
        for (const id of where.id.in) {
          const idx = relationships.findIndex(
            (r) => r.id === id && r.departmentId === where.departmentId,
          );
          if (idx >= 0) relationships.splice(idx, 1);
        }
      },
    },
    $transaction: async (fn) => fn(db),
    _relationships: relationships,
  };

  return db;
}

test("ensureInitialDepartmentOperator creates facility-operated current state", async () => {
  const db = makeOperatorDb({
    departmentId: "dept_1",
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [{ id: "org_ecmc", name: "ECMC" }],
    relationships: [],
  });

  const result = await ensureInitialDepartmentOperator(db as never, {
    departmentId: "dept_1",
    facilityId: "fac_1",
  });
  assert.equal(result.created, true);
  assert.equal(db._relationships.length, 1);
  assert.equal(db._relationships[0]?.organizationId, "org_ecmc");
  assert.equal(db._relationships[0]?.effectiveTo, null);
});

test("ensureInitialDepartmentOperator is idempotent", async () => {
  const db = makeOperatorDb({
    departmentId: "dept_1",
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [{ id: "org_ecmc", name: "ECMC" }],
    relationships: [
      {
        id: "rel_existing",
        departmentId: "dept_1",
        organizationId: "org_ecmc",
        effectiveFrom: facilityLocalDateToServiceDate("2026-01-01"),
        effectiveTo: null,
      },
    ],
  });
  const result = await ensureInitialDepartmentOperator(db as never, {
    departmentId: "dept_1",
    facilityId: "fac_1",
  });
  assert.equal(result.created, false);
  assert.equal(result.relationshipId, "rel_existing");
  assert.equal(db._relationships.length, 1);
});

test("assignDepartmentOperator closes prior period and schedules future without becoming current early", async () => {
  const db = makeOperatorDb({
    departmentId: "dept_1",
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [
      { id: "org_ecmc", name: "ECMC" },
      { id: "org_metz", name: "Metz Culinary Management" },
      { id: "org_sodexo", name: "Sodexo" },
    ],
    relationships: [
      {
        id: "rel_metz",
        departmentId: "dept_1",
        organizationId: "org_metz",
        effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
        effectiveTo: null,
      },
    ],
  });

  await assignDepartmentOperator(db as never, {
    departmentId: "dept_1",
    facilityId: "fac_1",
    organizationId: "org_sodexo",
    effectiveFromKey: "2027-01-01",
    createdByUserId: "user_1",
    replaceFutureScheduled: true,
  });

  const metz = db._relationships.find((r) => r.id === "rel_metz");
  const sodexo = db._relationships.find((r) => r.organizationId === "org_sodexo");
  assert.ok(metz);
  assert.ok(sodexo);
  assert.equal(metz!.effectiveTo?.toISOString().slice(0, 10), "2026-12-31");
  assert.equal(sodexo!.effectiveFrom.toISOString().slice(0, 10), "2027-01-01");
  assert.equal(sodexo!.effectiveTo, null);

  const today = await loadDepartmentOperatorOnDate(db as never, {
    departmentId: "dept_1",
    facilityId: "fac_1",
    onDate: facilityLocalDateToServiceDate("2026-10-07"),
  });
  assert.equal(today?.relationship.organizationId, "org_metz");
  assert.equal(today?.operatingModel, "CONTRACTED");

  const future = await loadDepartmentOperatorOnDate(db as never, {
    departmentId: "dept_1",
    facilityId: "fac_1",
    onDate: facilityLocalDateToServiceDate("2027-01-01"),
  });
  assert.equal(future?.relationship.organizationId, "org_sodexo");
});

test("assignDepartmentOperator rejects foreign facility department", async () => {
  const db = makeOperatorDb({
    departmentId: "dept_1",
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [{ id: "org_metz", name: "Metz" }],
    relationships: [],
  });

  await assert.rejects(
    () =>
      assignDepartmentOperator(db as never, {
        departmentId: "dept_1",
        facilityId: "fac_other",
        organizationId: "org_metz",
        effectiveFromKey: "2026-10-07",
      }),
    (error: unknown) =>
      error instanceof DepartmentOperatorError && error.code === "DEPARTMENT_NOT_FOUND",
  );
});

test("cancelFutureDepartmentOperatorChange restores prior open period", async () => {
  const db = makeOperatorDb({
    departmentId: "dept_1",
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [
      { id: "org_metz", name: "Metz" },
      { id: "org_sodexo", name: "Sodexo" },
    ],
    relationships: [
      {
        id: "rel_metz",
        departmentId: "dept_1",
        organizationId: "org_metz",
        effectiveFrom: facilityLocalDateToServiceDate("2024-01-01"),
        effectiveTo: facilityLocalDateToServiceDate("2026-12-31"),
      },
      {
        id: "rel_sodexo",
        departmentId: "dept_1",
        organizationId: "org_sodexo",
        effectiveFrom: facilityLocalDateToServiceDate("2027-01-01"),
        effectiveTo: null,
      },
    ],
  });

  await cancelFutureDepartmentOperatorChange(db as never, {
    departmentId: "dept_1",
    facilityId: "fac_1",
    relationshipId: "rel_sodexo",
    now: new Date("2026-10-07T15:00:00.000Z"),
  });

  assert.equal(db._relationships.length, 1);
  assert.equal(db._relationships[0]?.id, "rel_metz");
  assert.equal(db._relationships[0]?.effectiveTo, null);
});

test("operator relationship does not imply UserFacilityAccess (authorization remains separate)", () => {
  // Explicit Phase 1 invariant: domain module never imports facility-access grant helpers.
  const serviceSource = readFileSync(
    join(process.cwd(), "src/lib/department-operators/service.ts"),
    "utf8",
  );
  const typesSource = readFileSync(
    join(process.cwd(), "src/lib/department-operators/types.ts"),
    "utf8",
  );
  assert.doesNotMatch(serviceSource, /grantUserFacilityAccess|UserFacilityAccess|switchActiveFacility/);
  assert.match(typesSource, /does not grant facility authorization/i);
});

test("legacy managementCompanyName is not referenced by operator domain", () => {
  for (const file of ["service.ts", "types.ts", "periods.ts", "index.ts"]) {
    const source = readFileSync(
      join(process.cwd(), "src/lib/department-operators", file),
      "utf8",
    );
    assert.doesNotMatch(source, /managementCompanyName/);
  }
});

test("Admin facility settings no longer edit managementCompanyName as department operator", () => {
  const form = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/organization/facility-settings-form.tsx"),
    "utf8",
  );
  const actions = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/organization/actions.ts"),
    "utf8",
  );
  assert.doesNotMatch(form, /name="managementCompanyName"/);
  assert.doesNotMatch(form, /contracted food service operator/);
  assert.match(form, /Department operating organization/);
  assert.match(actions, /managementCompanyName is legacy and no longer writable/);
});

test("createOrganizationForNewFacility naming ignores contracted operator strings", () => {
  const types = readFileSync(
    join(process.cwd(), "src/lib/organization/types.ts"),
    "utf8",
  );
  assert.match(types, /intentionally ignored/);
  assert.match(types, /DepartmentOperatorRelationship/);
  assert.match(types, /void input\.managementCompanyName/);
});

test("department install and local create paths initialize operator relationships", () => {
  const install = readFileSync(
    join(process.cwd(), "src/lib/department-products/install.ts"),
    "utf8",
  );
  const create = readFileSync(
    join(process.cwd(), "src/lib/departments/create-department.ts"),
    "utf8",
  );
  assert.match(install, /ensureInitialDepartmentOperator/);
  assert.equal((install.match(/ensureInitialDepartmentOperator/g) ?? []).length >= 2, true);
  assert.match(create, /ensureInitialDepartmentOperator/);
});

test("operator server actions require Facility Administrator", () => {
  const actions = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/operator-actions.ts",
    ),
    "utf8",
  );
  assert.match(actions, /assertFacilityAdministratorAction/);
  assert.equal(
    (actions.match(/assertFacilityAdministratorAction\(session\.role\)/g) ?? []).length >= 4,
    true,
  );
});

test("Department Manage overview and list surface current operator", () => {
  const manage = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/manage/page.tsx",
    ),
    "utf8",
  );
  const list = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/departments/page.tsx"),
    "utf8",
  );
  const governance = readFileSync(
    join(
      process.cwd(),
      "src/components/department-operators/department-governance-section.tsx",
    ),
    "utf8",
  );
  assert.match(manage, /DepartmentGovernanceSection/);
  assert.match(manage, /loadCurrentDepartmentOperator/);
  assert.match(list, /Operated by/);
  assert.match(list, /loadCurrentOperatorsForFacilityDepartments/);
  assert.match(governance, /Department governance/);
  assert.match(governance, /Manage operating organization/);
});

test("assertFacilityAdministratorAction rejects non-FA roles", async () => {
  const { assertFacilityAdministratorAction } = await import("@/lib/facility-admin-guard");
  assert.doesNotThrow(() =>
    assertFacilityAdministratorAction("FACILITY_ADMINISTRATOR"),
  );
  assert.throws(
    () => assertFacilityAdministratorAction("GM"),
    /Facility Administrator access required/,
  );
  assert.throws(
    () => assertFacilityAdministratorAction("MANAGER"),
    /Facility Administrator access required/,
  );
  assert.throws(
    () => assertFacilityAdministratorAction("STAFF"),
    /Facility Administrator access required/,
  );
});

test("FA Organization settings edit only the session Facility parent Organization", () => {
  const actions = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/organization/actions.ts"),
    "utf8",
  );
  const operatorActions = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/operator-actions.ts",
    ),
    "utf8",
  );
  assert.match(actions, /loadOrganizationContext\(session\.facilityId\)/);
  assert.match(actions, /prisma\.organization\.update/);
  assert.match(actions, /where:\s*\{\s*id:\s*context\.organizationId/);
  assert.doesNotMatch(operatorActions, /organization\.update/);
  assert.match(
    operatorActions,
    /Does not authorize editing that Organization's canonical identity/,
  );
});
