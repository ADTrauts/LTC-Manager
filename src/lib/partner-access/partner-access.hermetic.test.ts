import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  assertNoOverlappingPeriods,
  deriveFacilityPartnerLifecycleState,
  FacilityPartnerError,
  periodContainsInstant,
  periodsOverlap,
  phase2aGrantsNoUserFacilityAccess,
} from "@/lib/partner-access";
import {
  activateFacilityPartner,
  addPartnerDepartmentScope,
  createFacilityPartner,
  endFacilityPartner,
  getFacilityPartner,
  getPartnerScopeAt,
  removePartnerDepartmentScope,
  resumeFacilityPartner,
  suspendFacilityPartner,
} from "@/lib/partner-access/service";

test("half-open periodContainsInstant is deterministic at boundaries", () => {
  const period = {
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-06-14T13:42:00.000Z"),
  };
  assert.equal(periodContainsInstant(period, new Date("2027-01-01T00:00:00.000Z")), true);
  assert.equal(periodContainsInstant(period, new Date("2027-06-14T13:41:59.999Z")), true);
  assert.equal(periodContainsInstant(period, new Date("2027-06-14T13:42:00.000Z")), false);
  assert.equal(periodContainsInstant(period, new Date("2026-12-31T23:59:59.999Z")), false);
});

test("periodsOverlap rejects overlapping open ranges", () => {
  assert.equal(
    periodsOverlap(
      { startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null },
      { startsAt: new Date("2027-03-01T00:00:00.000Z"), endsAt: null },
    ),
    true,
  );
  assert.equal(
    periodsOverlap(
      {
        startsAt: new Date("2027-01-01T00:00:00.000Z"),
        endsAt: new Date("2027-03-01T00:00:00.000Z"),
      },
      { startsAt: new Date("2027-03-01T00:00:00.000Z"), endsAt: null },
    ),
    false,
  );
});

test("assertNoOverlappingPeriods throws", () => {
  assert.throws(
    () =>
      assertNoOverlappingPeriods([
        { startsAt: new Date("2027-01-01T00:00:00.000Z"), endsAt: null },
        { startsAt: new Date("2027-02-01T00:00:00.000Z"), endsAt: null },
      ]),
    /Overlapping/,
  );
});

test("deriveFacilityPartnerLifecycleState covers pending/active/suspended/ended", () => {
  const now = new Date("2027-04-01T12:00:00.000Z");
  assert.equal(
    deriveFacilityPartnerLifecycleState({ endedAt: null, accessPeriods: [], now }),
    "PENDING",
  );
  assert.equal(
    deriveFacilityPartnerLifecycleState({
      endedAt: null,
      accessPeriods: [
        {
          startsAt: new Date("2027-05-01T00:00:00.000Z"),
          endsAt: null,
        },
      ],
      now,
    }),
    "PENDING",
  );
  assert.equal(
    deriveFacilityPartnerLifecycleState({
      endedAt: null,
      accessPeriods: [
        {
          startsAt: new Date("2027-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ],
      now,
    }),
    "ACTIVE",
  );
  assert.equal(
    deriveFacilityPartnerLifecycleState({
      endedAt: null,
      accessPeriods: [
        {
          startsAt: new Date("2027-01-01T00:00:00.000Z"),
          endsAt: new Date("2027-03-01T00:00:00.000Z"),
        },
      ],
      now,
    }),
    "SUSPENDED",
  );
  assert.equal(
    deriveFacilityPartnerLifecycleState({
      endedAt: new Date("2027-03-15T00:00:00.000Z"),
      accessPeriods: [],
      now,
    }),
    "ENDED",
  );
});

type Org = {
  id: string;
  name: string;
  displayName?: string | null;
  isActive?: boolean;
};
type Dept = { id: string; facilityId: string; key: string; name: string; isActive?: boolean };
type Partnership = {
  id: string;
  facilityId: string;
  organizationId: string;
  notes: string | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  endedByUserId: string | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type AccessPeriod = {
  id: string;
  facilityPartnerOrganizationId: string;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type Scope = {
  id: string;
  facilityPartnerOrganizationId: string;
  departmentId: string;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeDb(state: {
  facilityId: string;
  facilityOrganizationId: string;
  organizations: Org[];
  departments: Dept[];
}) {
  let seq = 0;
  const partnerships: Partnership[] = [];
  const accessPeriods: AccessPeriod[] = [];
  const scopes: Scope[] = [];
  const orgById = new Map(state.organizations.map((o) => [o.id, o]));
  const deptById = new Map(state.departments.map((d) => [d.id, d]));

  const orgSelect = (id: string) => {
    const o = orgById.get(id)!;
    return {
      id: o.id,
      name: o.name,
      displayName: o.displayName ?? o.name,
      legalName: null,
      organizationType: "MANAGEMENT_COMPANY",
      isActive: o.isActive ?? true,
    };
  };

  const includePartnership = (p: Partnership) => ({
    ...p,
    organization: orgSelect(p.organizationId),
    accessPeriods: accessPeriods
      .filter((a) => a.facilityPartnerOrganizationId === p.id)
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    departmentScopes: scopes
      .filter((s) => s.facilityPartnerOrganizationId === p.id)
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map((s) => ({
        ...s,
        department: {
          id: deptById.get(s.departmentId)!.id,
          name: deptById.get(s.departmentId)!.name,
          key: deptById.get(s.departmentId)!.key,
        },
      })),
  });

  const db = {
    facility: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === state.facilityId
          ? { id: state.facilityId, organizationId: state.facilityOrganizationId }
          : null,
    },
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const o = orgById.get(where.id);
        return o ? orgSelect(o.id) : null;
      },
    },
    department: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; facilityId: string };
      }) => {
        const d = deptById.get(where.id);
        if (!d || d.facilityId !== where.facilityId) return null;
        return { id: d.id, name: d.name, key: d.key, isActive: d.isActive ?? true };
      },
    },
    facilityPartnerOrganization: {
      findUnique: async ({
        where,
      }: {
        where: { facilityId_organizationId: { facilityId: string; organizationId: string } };
      }) => {
        const p = partnerships.find(
          (row) =>
            row.facilityId === where.facilityId_organizationId.facilityId &&
            row.organizationId === where.facilityId_organizationId.organizationId,
        );
        return p ? { id: p.id, endedAt: p.endedAt } : null;
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; facilityId: string };
      }) => {
        const p = partnerships.find(
          (row) => row.id === where.id && row.facilityId === where.facilityId,
        );
        return p ? includePartnership(p) : null;
      },
      findMany: async ({ where }: { where: { facilityId: string } }) =>
        partnerships
          .filter((p) => p.facilityId === where.facilityId)
          .map((p) => includePartnership(p)),
      create: async ({
        data,
      }: {
        data: {
          facilityId: string;
          organizationId: string;
          notes: string | null;
          createdByUserId: string | null;
        };
      }) => {
        seq += 1;
        const created: Partnership = {
          id: `p_${seq}`,
          facilityId: data.facilityId,
          organizationId: data.organizationId,
          notes: data.notes,
          createdByUserId: data.createdByUserId,
          approvedByUserId: null,
          approvedAt: null,
          endedByUserId: null,
          endedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        partnerships.push(created);
        return { id: created.id };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Partnership>;
      }) => {
        const p = partnerships.find((row) => row.id === where.id);
        if (!p) throw new Error("missing partnership");
        Object.assign(p, data, { updatedAt: new Date() });
        return p;
      },
    },
    facilityPartnerAccessPeriod: {
      create: async ({ data }: { data: Omit<AccessPeriod, "id" | "createdAt" | "updatedAt"> }) => {
        seq += 1;
        const created: AccessPeriod = {
          id: `ap_${seq}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        accessPeriods.push(created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<AccessPeriod>;
      }) => {
        const row = accessPeriods.find((a) => a.id === where.id);
        if (!row) throw new Error("missing period");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      findMany: async ({
        where,
      }: {
        where: { facilityPartnerOrganizationId: string };
      }) =>
        accessPeriods.filter(
          (a) => a.facilityPartnerOrganizationId === where.facilityPartnerOrganizationId,
        ),
    },
    facilityPartnerDepartmentScope: {
      create: async ({ data }: { data: Omit<Scope, "id" | "createdAt" | "updatedAt"> }) => {
        seq += 1;
        const created: Scope = {
          id: `sc_${seq}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        scopes.push(created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Scope>;
      }) => {
        const row = scopes.find((s) => s.id === where.id);
        if (!row) throw new Error("missing scope");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    // Minimal stubs for loadCustomerOperableDepartments / operator suggestion paths
    facilityBilling: { findUnique: async () => null },
    facilityDepartmentEntitlement: { findMany: async () => [] },
    department: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; facilityId: string };
      }) => {
        const d = deptById.get(where.id);
        if (!d || d.facilityId !== where.facilityId) return null;
        return { id: d.id, name: d.name, key: d.key, isActive: d.isActive ?? true };
      },
      findMany: async ({ where }: { where: { facilityId: string } }) =>
        state.departments
          .filter((d) => d.facilityId === where.facilityId)
          .map((d) => ({
            id: d.id,
            facilityId: d.facilityId,
            key: d.key,
            name: d.name,
            isActive: d.isActive ?? true,
            sortOrder: 100,
            showInEmployeeApp: true,
          })),
    },
    $transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
    _partnerships: partnerships,
    _accessPeriods: accessPeriods,
    _scopes: scopes,
  };

  // Fix duplicate department key — merge findFirst into single department object
  db.department = {
    findFirst: async ({ where }: { where: { id: string; facilityId: string } }) => {
      const d = deptById.get(where.id);
      if (!d || d.facilityId !== where.facilityId) return null;
      return { id: d.id, name: d.name, key: d.key, isActive: d.isActive ?? true };
    },
    findMany: async ({ where }: { where: { facilityId: string } }) =>
      state.departments
        .filter((d) => d.facilityId === where.facilityId)
        .map((d) => ({
          id: d.id,
          facilityId: d.facilityId,
          key: d.key,
          name: d.name,
          isActive: d.isActive ?? true,
          sortOrder: 100,
          showInEmployeeApp: true,
        })),
  };

  return db;
}

// Stub catalog loader path: service calls loadCustomerOperableDepartments which needs more of prisma.
// For add scope tests we mock at a higher level by monkeypatching via dynamic import replacement —
// simpler approach: call domain with db that also satisfies catalog via findMany returning depts.
// loadFacilityDepartmentAccessContext needs billing + entitlements + departments — stubs above help
// only if we patch. Instead, test service methods that don't need catalog with mock, and
// for scope add use a thin wrapper that bypasses operable check by making operable list via
// module mock — too heavy. Simpler: unit-test create/activate/suspend/resume/end with mock,
// and test scope overlap logic via periods + a simplified internal path.

test("createFacilityPartner rejects parent Organization", async () => {
  const db = makeDb({
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [
      { id: "org_ecmc", name: "ECMC" },
      { id: "org_metz", name: "Metz" },
    ],
    departments: [],
  });
  await assert.rejects(
    () =>
      createFacilityPartner(db as never, {
        facilityId: "fac_1",
        organizationId: "org_ecmc",
      }),
    (error: unknown) =>
      error instanceof FacilityPartnerError && error.code === "PARENT_ORGANIZATION_REJECTED",
  );
});

test("partnership lifecycle: pending → active → suspended → resumed → ended", async () => {
  const db = makeDb({
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [
      { id: "org_ecmc", name: "ECMC" },
      { id: "org_metz", name: "Metz Culinary Management", displayName: "Metz" },
    ],
    departments: [
      { id: "dept_fn", facilityId: "fac_1", key: "DIETARY", name: "Food & Nutrition" },
    ],
  });

  const created = await createFacilityPartner(db as never, {
    facilityId: "fac_1",
    organizationId: "org_metz",
    createdByUserId: "user_fa",
  });
  assert.equal(created.lifecycleState, "PENDING");
  assert.equal(created.currentAccessPeriod, null);

  const t0 = new Date("2027-01-01T00:00:00.000Z");
  await activateFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    startsAt: t0,
    actorUserId: "user_fa",
  });
  const activated = await getFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    now: t0,
  });
  assert.equal(activated.lifecycleState, "ACTIVE");
  assert.ok(activated.approvedAt);
  assert.equal(activated.accessPeriods.length, 1);

  const beforeStart = await getFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    now: new Date("2026-12-01T00:00:00.000Z"),
  });
  assert.equal(beforeStart.lifecycleState, "PENDING");

  const tSuspend = new Date("2027-06-14T13:42:00.000Z");
  await suspendFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    endsAt: tSuspend,
    actorUserId: "user_fa",
  });
  const suspended = await getFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    now: tSuspend,
  });
  assert.equal(suspended.lifecycleState, "SUSPENDED");
  assert.equal(suspended.accessPeriods[0]?.endsAt?.toISOString(), tSuspend.toISOString());

  const tResume = new Date("2027-07-01T08:00:00.000Z");
  await resumeFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    startsAt: tResume,
    actorUserId: "user_fa",
  });
  const resumed = await getFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    now: tResume,
  });
  assert.equal(resumed.lifecycleState, "ACTIVE");
  assert.equal(resumed.accessPeriods.length, 2);
  assert.equal(resumed.accessPeriods[0]?.endsAt?.toISOString(), tSuspend.toISOString());

  const tEnd = new Date("2027-08-01T00:00:00.000Z");
  await endFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    endedAt: tEnd,
    actorUserId: "user_fa",
  });
  const ended = await getFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    now: tEnd,
  });
  assert.equal(ended.lifecycleState, "ENDED");
  assert.ok(ended.endedAt);

  await assert.rejects(
    () =>
      activateFacilityPartner(db as never, {
        partnershipId: created.id,
        facilityId: "fac_1",
        startsAt: new Date("2027-09-01T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof FacilityPartnerError && error.code === "PARTNERSHIP_ENDED",
  );

  const org = await db.organization.findUnique({ where: { id: "org_metz" } });
  assert.ok(org);
  assert.equal(org.isActive, true);
});

test("overlapping access periods rejected", async () => {
  const db = makeDb({
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [
      { id: "org_ecmc", name: "ECMC" },
      { id: "org_metz", name: "Metz" },
    ],
    departments: [],
  });
  const created = await createFacilityPartner(db as never, {
    facilityId: "fac_1",
    organizationId: "org_metz",
  });
  await activateFacilityPartner(db as never, {
    partnershipId: created.id,
    facilityId: "fac_1",
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
  });
  await assert.rejects(
    () =>
      activateFacilityPartner(db as never, {
        partnershipId: created.id,
        facilityId: "fac_1",
        startsAt: new Date("2027-02-01T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof FacilityPartnerError && error.code === "OVERLAPPING_PERIOD",
  );
});

test("phase2a grants zero user facility access and does not wire UserFacilityAccess", () => {
  assert.equal(phase2aGrantsNoUserFacilityAccess(), true);
  const service = readFileSync(
    join(process.cwd(), "src/lib/partner-access/service.ts"),
    "utf8",
  );
  assert.doesNotMatch(service, /grantUserFacilityAccess|prisma\.userFacilityAccess|switchActiveFacility/);
  assert.doesNotMatch(service, /canAccessFacility\s*\(/);
  assert.match(service, /Phase 2A intentionally does not authorize users/);
});

test("operator relationship is independent of partnership domain module", () => {
  const service = readFileSync(
    join(process.cwd(), "src/lib/partner-access/service.ts"),
    "utf8",
  );
  // Suggestion may read operators; mutations must not write operator relationships.
  assert.doesNotMatch(service, /departmentOperatorRelationship\.(create|update|delete)/);
  assert.match(service, /Never auto-creates partner scopes|Informational only/i);
});

test("existing cross-org UserFacilityAccess denial remains in facility-access module", () => {
  const grant = readFileSync(
    join(process.cwd(), "src/lib/facility-access/assert-user-facility-access.ts"),
    "utf8",
  );
  assert.match(grant, /Cross-organization facility grant rejected/);
  const switchFile = readFileSync(
    join(process.cwd(), "src/lib/facility-access/switch-active-facility.ts"),
    "utf8",
  );
  assert.match(switchFile, /Cross-organization facility switch rejected/);
});

test("Admin Partners routes and FA gating exist", () => {
  const list = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/organization/partners/page.tsx"),
    "utf8",
  );
  const detail = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/organization/partners/[partnershipId]/page.tsx",
    ),
    "utf8",
  );
  const actions = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/organization/partners/actions.ts"),
    "utf8",
  );
  assert.match(list, /External Partners|facility partners/i);
  assert.match(list, /Partner users are not yet granted access/i);
  assert.match(detail, /assertFacilityAdministratorPage/);
  assert.match(actions, /assertFacilityAdministratorAction/);
  assert.match(actions, /createFacilityPartner|activateFacilityPartner/);
  assert.doesNotMatch(actions, /PartnerUserFacilityAccess|UserOrganizationMembership/);
});

test("department scope add/remove/re-add preserves history", async () => {
  const db = makeDb({
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [
      { id: "org_ecmc", name: "ECMC" },
      { id: "org_metz", name: "Metz" },
    ],
    departments: [
      { id: "dept_fn", facilityId: "fac_1", key: "DIETARY", name: "Food & Nutrition" },
      { id: "dept_other", facilityId: "fac_other", key: "DIETARY", name: "Other Facility FN" },
    ],
  });

  const partner = await createFacilityPartner(db as never, {
    facilityId: "fac_1",
    organizationId: "org_metz",
  });

  const tAdd = new Date("2027-02-01T10:00:00.000Z");
  await addPartnerDepartmentScope(db as never, {
    partnershipId: partner.id,
    facilityId: "fac_1",
    departmentId: "dept_fn",
    startsAt: tAdd,
    actorUserId: "user_fa",
  });

  const current = await getFacilityPartner(db as never, {
    partnershipId: partner.id,
    facilityId: "fac_1",
    now: tAdd,
  });
  assert.equal(current.currentDepartmentScopes.length, 1);
  assert.equal(current.currentDepartmentScopes[0]?.departmentId, "dept_fn");

  await assert.rejects(
    () =>
      addPartnerDepartmentScope(db as never, {
        partnershipId: partner.id,
        facilityId: "fac_1",
        departmentId: "dept_fn",
        startsAt: new Date("2027-02-02T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof FacilityPartnerError && error.code === "SCOPE_ALREADY_ACTIVE",
  );

  await assert.rejects(
    () =>
      addPartnerDepartmentScope(db as never, {
        partnershipId: partner.id,
        facilityId: "fac_1",
        departmentId: "dept_other",
        startsAt: new Date("2027-02-02T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof FacilityPartnerError && error.code === "DEPARTMENT_NOT_FOUND",
  );

  const tRemove = new Date("2027-03-01T12:00:00.000Z");
  await removePartnerDepartmentScope(db as never, {
    partnershipId: partner.id,
    facilityId: "fac_1",
    departmentId: "dept_fn",
    endsAt: tRemove,
  });

  const afterRemove = await getFacilityPartner(db as never, {
    partnershipId: partner.id,
    facilityId: "fac_1",
    now: tRemove,
  });
  assert.equal(afterRemove.currentDepartmentScopes.length, 0);
  assert.equal(afterRemove.departmentScopes.length, 1);
  assert.equal(afterRemove.departmentScopes[0]?.endsAt?.toISOString(), tRemove.toISOString());

  const historical = await getPartnerScopeAt(db as never, {
    partnershipId: partner.id,
    facilityId: "fac_1",
    departmentId: "dept_fn",
    at: new Date("2027-02-15T00:00:00.000Z"),
  });
  assert.ok(historical);
  assert.equal(historical.departmentId, "dept_fn");

  const tReadd = new Date("2027-04-01T08:00:00.000Z");
  await addPartnerDepartmentScope(db as never, {
    partnershipId: partner.id,
    facilityId: "fac_1",
    departmentId: "dept_fn",
    startsAt: tReadd,
  });
  const readded = await getFacilityPartner(db as never, {
    partnershipId: partner.id,
    facilityId: "fac_1",
    now: tReadd,
  });
  assert.equal(readded.currentDepartmentScopes.length, 1);
  assert.equal(readded.departmentScopes.length, 2);
});

test("operator relationships are not created by partnership mutations", async () => {
  const service = readFileSync(
    join(process.cwd(), "src/lib/partner-access/service.ts"),
    "utf8",
  );
  assert.doesNotMatch(service, /assignDepartmentOperator|departmentOperatorRelationship\.create/);

  const db = makeDb({
    facilityId: "fac_1",
    facilityOrganizationId: "org_ecmc",
    organizations: [
      { id: "org_ecmc", name: "ECMC" },
      { id: "org_metz", name: "Metz" },
    ],
    departments: [
      { id: "dept_fn", facilityId: "fac_1", key: "DIETARY", name: "Food & Nutrition" },
    ],
  });
  const partner = await createFacilityPartner(db as never, {
    facilityId: "fac_1",
    organizationId: "org_metz",
  });
  assert.equal(partner.currentDepartmentScopes.length, 0);
  assert.equal(partner.departmentScopes.length, 0);
});
