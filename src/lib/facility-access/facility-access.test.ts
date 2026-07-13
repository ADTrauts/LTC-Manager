import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageFacilityAccess,
  resolveDepartmentCarryoverForFacilitySwitch,
} from "@/lib/facility-access";
import {
  assertUserFacilityAccess,
  ensureUserFacilityAccessGrant,
  grantUserFacilityAccess,
  revokeUserFacilityAccess,
  userHasActiveFacilityAccess,
} from "@/lib/facility-access/assert-user-facility-access";
import { switchActiveFacility } from "@/lib/facility-access/switch-active-facility";

type AccessRow = {
  id: string;
  userId: string;
  facilityId: string;
  isActive: boolean;
  revokedAt: Date | null;
  grantedByUserId: string | null;
};

function createMemoryDb(seed: {
  facilities: Array<{ id: string; displayName: string; organizationId: string }>;
  users: Array<{
    id: string;
    facilityId: string;
    isActive?: boolean;
    primaryDepartmentId?: string | null;
  }>;
  accesses?: AccessRow[];
  departments?: Array<{
    id: string;
    facilityId: string;
    key: string;
    isActive?: boolean;
    showInEmployeeApp?: boolean;
  }>;
}) {
  const accesses: AccessRow[] = [...(seed.accesses ?? [])];
  const users = seed.users.map((u) => ({
    ...u,
    isActive: u.isActive ?? true,
    primaryDepartmentId: u.primaryDepartmentId ?? null,
  }));
  const facilities = seed.facilities;
  const departments = (seed.departments ?? []).map((d) => ({
    isActive: true,
    showInEmployeeApp: true,
    ...d,
  }));
  let idSeq = 100;

  const db = {
    userFacilityAccess: {
      findFirst: async (args: {
        where: { userId: string; facilityId: string; isActive: boolean; revokedAt: null };
      }) => {
        const row = accesses.find(
          (a) =>
            a.userId === args.where.userId &&
            a.facilityId === args.where.facilityId &&
            a.isActive === args.where.isActive &&
            a.revokedAt === null,
        );
        return row ? { id: row.id } : null;
      },
      findUnique: async (args: {
        where: { userId_facilityId: { userId: string; facilityId: string } } | { id: string };
      }) => {
        if ("id" in args.where && typeof (args.where as { id?: string }).id === "string") {
          return accesses.find((a) => a.id === (args.where as { id: string }).id) ?? null;
        }
        const key = (args.where as { userId_facilityId: { userId: string; facilityId: string } })
          .userId_facilityId;
        return (
          accesses.find((a) => a.userId === key.userId && a.facilityId === key.facilityId) ?? null
        );
      },
      findMany: async (args: {
        where: { userId: string; isActive: boolean; revokedAt: null };
      }) => {
        return accesses
          .filter(
            (a) =>
              a.userId === args.where.userId &&
              a.isActive === args.where.isActive &&
              a.revokedAt === null,
          )
          .map((a) => {
            const facility = facilities.find((f) => f.id === a.facilityId)!;
            return {
              facilityId: a.facilityId,
              facility: {
                id: facility.id,
                displayName: facility.displayName,
                organizationId: facility.organizationId,
                organization: {
                  id: facility.organizationId,
                  name: `Org ${facility.organizationId}`,
                  displayName: null,
                },
              },
            };
          });
      },
      count: async (args: { where: { userId: string; isActive: boolean; revokedAt: null } }) => {
        return accesses.filter(
          (a) =>
            a.userId === args.where.userId &&
            a.isActive === args.where.isActive &&
            a.revokedAt === null,
        ).length;
      },
      create: async (args: {
        data: {
          userId: string;
          facilityId: string;
          isActive: boolean;
          grantedByUserId: string | null;
        };
        select: { id: true };
      }) => {
        const row: AccessRow = {
          id: `a${idSeq++}`,
          userId: args.data.userId,
          facilityId: args.data.facilityId,
          isActive: args.data.isActive,
          revokedAt: null,
          grantedByUserId: args.data.grantedByUserId,
        };
        accesses.push(row);
        return { id: row.id };
      },
      update: async (args: {
        where: { id: string };
        data: Partial<AccessRow>;
      }) => {
        const row = accesses.find((a) => a.id === args.where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, args.data);
        return row;
      },
    },
    facility: {
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        const f = facilities.find((x) => x.id === args.where.id);
        if (!f) return null;
        return {
          id: f.id,
          displayName: f.displayName,
          organizationId: f.organizationId,
          organization: { id: f.organizationId },
        };
      },
    },
    user: {
      findUnique: async (args: { where: { id: string } }) => {
        const u = users.find((x) => x.id === args.where.id);
        if (!u) return null;
        const facility = facilities.find((f) => f.id === u.facilityId)!;
        return {
          id: u.id,
          facilityId: u.facilityId,
          isActive: u.isActive,
          primaryDepartmentId: u.primaryDepartmentId,
          facility: { organizationId: facility.organizationId },
          facilityAccesses: accesses
            .filter((a) => a.userId === u.id && a.isActive && !a.revokedAt)
            .map((a) => {
              const fac = facilities.find((f) => f.id === a.facilityId)!;
              return { facility: { organizationId: fac.organizationId } };
            }),
          role: { key: "FACILITY_ADMINISTRATOR" as const },
        };
      },
      update: async (args: {
        where: { id: string };
        data: { facilityId?: string; primaryDepartmentId?: string | null };
      }) => {
        const u = users.find((x) => x.id === args.where.id);
        if (!u) throw new Error("missing user");
        if (args.data.facilityId !== undefined) u.facilityId = args.data.facilityId;
        if (args.data.primaryDepartmentId !== undefined) {
          u.primaryDepartmentId = args.data.primaryDepartmentId;
        }
        return u;
      },
    },
    department: {
      findUnique: async (args: { where: { id: string } }) => {
        const d = departments.find((x) => x.id === args.where.id);
        return d ? { key: d.key } : null;
      },
      findFirst: async (args: {
        where: {
          facilityId: string;
          key: string;
          isActive: boolean;
          showInEmployeeApp: boolean;
        };
      }) => {
        const d = departments.find(
          (x) =>
            x.facilityId === args.where.facilityId &&
            x.key === args.where.key &&
            x.isActive &&
            x.showInEmployeeApp,
        );
        return d ? { id: d.id } : null;
      },
    },
    _accesses: accesses,
    _users: users,
  };

  return db;
}

test("canManageFacilityAccess is FA-only", () => {
  assert.equal(canManageFacilityAccess("FACILITY_ADMINISTRATOR"), true);
  assert.equal(canManageFacilityAccess("GM"), false);
  assert.equal(canManageFacilityAccess("MANAGER"), false);
});

test("explicit grant allows facility; shared org without grant does not", async () => {
  const db = createMemoryDb({
    facilities: [
      { id: "fac_a", displayName: "A", organizationId: "org_1" },
      { id: "fac_b", displayName: "B", organizationId: "org_1" },
    ],
    users: [{ id: "u1", facilityId: "fac_a" }],
    accesses: [
      {
        id: "a1",
        userId: "u1",
        facilityId: "fac_a",
        isActive: true,
        revokedAt: null,
        grantedByUserId: null,
      },
    ],
  });

  assert.equal(await userHasActiveFacilityAccess(db as never, "u1", "fac_a"), true);
  assert.equal(await userHasActiveFacilityAccess(db as never, "u1", "fac_b"), false);
  await assert.rejects(() => assertUserFacilityAccess(db as never, "u1", "fac_b"), /denied/);
});

test("cross-organization grant rejected", async () => {
  const db = createMemoryDb({
    facilities: [
      { id: "fac_a", displayName: "A", organizationId: "org_1" },
      { id: "fac_x", displayName: "X", organizationId: "org_2" },
    ],
    users: [{ id: "u1", facilityId: "fac_a" }],
    accesses: [
      {
        id: "a1",
        userId: "u1",
        facilityId: "fac_a",
        isActive: true,
        revokedAt: null,
        grantedByUserId: null,
      },
    ],
  });

  await assert.rejects(
    () =>
      grantUserFacilityAccess(db as never, {
        actorUserId: "admin",
        actorFacilityId: "fac_a",
        targetUserId: "u1",
        targetFacilityId: "fac_x",
      }),
    /Cross-organization/,
  );
});

test("grant then revoke; revoked and inactive denied; cannot revoke only access", async () => {
  const db = createMemoryDb({
    facilities: [
      { id: "fac_a", displayName: "A", organizationId: "org_1" },
      { id: "fac_b", displayName: "B", organizationId: "org_1" },
    ],
    users: [
      { id: "admin", facilityId: "fac_a" },
      { id: "u1", facilityId: "fac_a" },
    ],
    accesses: [
      {
        id: "a1",
        userId: "u1",
        facilityId: "fac_a",
        isActive: true,
        revokedAt: null,
        grantedByUserId: null,
      },
      {
        id: "admin_a",
        userId: "admin",
        facilityId: "fac_a",
        isActive: true,
        revokedAt: null,
        grantedByUserId: null,
      },
    ],
  });

  await grantUserFacilityAccess(db as never, {
    actorUserId: "admin",
    actorFacilityId: "fac_a",
    targetUserId: "u1",
    targetFacilityId: "fac_b",
  });
  assert.equal(await userHasActiveFacilityAccess(db as never, "u1", "fac_b"), true);

  await revokeUserFacilityAccess(db as never, {
    actorUserId: "admin",
    actorFacilityId: "fac_a",
    targetUserId: "u1",
    targetFacilityId: "fac_b",
  });
  assert.equal(await userHasActiveFacilityAccess(db as never, "u1", "fac_b"), false);

  await assert.rejects(
    () =>
      revokeUserFacilityAccess(db as never, {
        actorUserId: "admin",
        actorFacilityId: "fac_a",
        targetUserId: "u1",
        targetFacilityId: "fac_a",
      }),
    /only facility access|current facility/,
  );
});

test("duplicate grant is idempotent", async () => {
  const db = createMemoryDb({
    facilities: [{ id: "fac_a", displayName: "A", organizationId: "org_1" }],
    users: [{ id: "u1", facilityId: "fac_a" }],
  });
  const first = await ensureUserFacilityAccessGrant(db as never, {
    userId: "u1",
    facilityId: "fac_a",
  });
  const second = await ensureUserFacilityAccessGrant(db as never, {
    userId: "u1",
    facilityId: "fac_a",
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.id, second.id);
});

test("valid switch updates User.facilityId; invalid/cross-org rejected", async () => {
  const db = createMemoryDb({
    facilities: [
      { id: "fac_a", displayName: "A", organizationId: "org_1" },
      { id: "fac_b", displayName: "B", organizationId: "org_1" },
      { id: "fac_x", displayName: "X", organizationId: "org_2" },
    ],
    users: [{ id: "u1", facilityId: "fac_a", primaryDepartmentId: "dept_a_dietary" }],
    accesses: [
      {
        id: "a1",
        userId: "u1",
        facilityId: "fac_a",
        isActive: true,
        revokedAt: null,
        grantedByUserId: null,
      },
      {
        id: "a2",
        userId: "u1",
        facilityId: "fac_b",
        isActive: true,
        revokedAt: null,
        grantedByUserId: null,
      },
    ],
    departments: [
      { id: "dept_a_dietary", facilityId: "fac_a", key: "DIETARY" },
      { id: "dept_b_dietary", facilityId: "fac_b", key: "DIETARY" },
    ],
  });

  const result = await switchActiveFacility(
    {
      userId: "u1",
      authKind: "user",
      role: "FACILITY_ADMINISTRATOR",
      sourceFacilityId: "fac_a",
      destinationFacilityId: "fac_b",
      sourceDepartmentId: "dept_a_dietary",
      sourceDepartmentKey: "DIETARY",
    },
    db as never,
  );
  assert.equal(result.facilityId, "fac_b");
  assert.equal(result.primaryDepartmentId, "dept_b_dietary");
  assert.equal(db._users[0].facilityId, "fac_b");
  assert.ok(result.redirectPath);

  await assert.rejects(
    () =>
      switchActiveFacility(
        {
          userId: "u1",
          authKind: "user",
          role: "FACILITY_ADMINISTRATOR",
          sourceFacilityId: "fac_b",
          destinationFacilityId: "fac_x",
          sourceDepartmentId: null,
        },
        db as never,
      ),
    /denied|Cross-organization/,
  );

  await assert.rejects(
    () =>
      switchActiveFacility(
        {
          userId: "u1",
          authKind: "employee",
          role: "STAFF",
          sourceFacilityId: "fac_b",
          destinationFacilityId: "fac_a",
        },
        db as never,
      ),
    /PIN/,
  );
});

test("department carryover: Dietary preserved when present; cleared when missing; EVS compatible", async () => {
  const db = createMemoryDb({
    facilities: [
      { id: "fac_a", displayName: "A", organizationId: "org_1" },
      { id: "fac_b", displayName: "B", organizationId: "org_1" },
      { id: "fac_c", displayName: "C", organizationId: "org_1" },
    ],
    users: [{ id: "u1", facilityId: "fac_a" }],
    departments: [
      { id: "a_dietary", facilityId: "fac_a", key: "DIETARY" },
      { id: "a_evs", facilityId: "fac_a", key: "EVS" },
      { id: "b_evs", facilityId: "fac_b", key: "EVS" },
      // fac_c has no DIETARY
      { id: "c_plant", facilityId: "fac_c", key: "PLANT" },
    ],
  });

  const dietaryMissing = await resolveDepartmentCarryoverForFacilitySwitch(db as never, {
    destinationFacilityId: "fac_c",
    sourceDepartmentId: "a_dietary",
    sourceDepartmentKey: "DIETARY",
  });
  assert.equal(dietaryMissing.primaryDepartmentId, null);
  assert.equal(dietaryMissing.departmentCookieValue, null);

  const evsOk = await resolveDepartmentCarryoverForFacilitySwitch(db as never, {
    destinationFacilityId: "fac_b",
    sourceDepartmentId: "a_evs",
    sourceDepartmentKey: "EVS",
  });
  assert.equal(evsOk.primaryDepartmentId, "b_evs");

  const noLens = await resolveDepartmentCarryoverForFacilitySwitch(db as never, {
    destinationFacilityId: "fac_b",
    sourceDepartmentId: null,
    sourceDepartmentKey: null,
  });
  assert.equal(noLens.departmentCookieValue, null);
});

test("backfill naming contract: one grant per user+facility unique", async () => {
  const db = createMemoryDb({
    facilities: [{ id: "fac_a", displayName: "A", organizationId: "org_1" }],
    users: [
      { id: "u1", facilityId: "fac_a" },
      { id: "u2", facilityId: "fac_a" },
    ],
  });
  await ensureUserFacilityAccessGrant(db as never, { userId: "u1", facilityId: "fac_a" });
  await ensureUserFacilityAccessGrant(db as never, { userId: "u2", facilityId: "fac_a" });
  assert.equal(db._accesses.length, 2);
  assert.equal(
    db._accesses.every((a) => a.facilityId === "fac_a" && a.isActive),
    true,
  );
});
