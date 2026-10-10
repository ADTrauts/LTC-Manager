import assert from "node:assert/strict";
import test from "node:test";

import type { RoleKey } from "@prisma/client";

import { validateSessionAuthority } from "@/lib/session-revocation/session-version";

import {
  changeInternalFacilityRole,
  ensureCurrentInternalFacilityRole,
  resolveCurrentInternalFacilityRole,
} from "./internal-facility-role";
import { grantUserFacilityAccess, revokeUserFacilityAccess } from "./assert-user-facility-access";
import { switchActiveFacility } from "./switch-active-facility";

type RolePeriod = {
  id: string;
  userFacilityAccessId: string;
  roleKey: RoleKey;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
};

function at(iso: string) {
  return new Date(iso);
}

function createDb() {
  let seq = 1;
  const nextId = (prefix: string) => `${prefix}_${seq++}`;
  const roles = [
    { id: "role_manager", key: "MANAGER" as RoleKey, isActive: true },
    { id: "role_staff", key: "STAFF" as RoleKey, isActive: true },
    { id: "role_supervisor", key: "SUPERVISOR" as RoleKey, isActive: true },
  ];
  const facilities = [
    { id: "terrace", displayName: "Terrace View", organizationId: "ecmc" },
    { id: "hospital", displayName: "ECMC Hospital", organizationId: "ecmc" },
    { id: "otherco", displayName: "OtherCo Clinic", organizationId: "other" },
  ];
  const users = [
    {
      id: "sarah",
      email: "sarah@example.com",
      displayName: "Sarah Johnson",
      isActive: true,
      facilityId: "terrace" as string | null,
      roleId: "role_manager" as string | null,
      primaryDepartmentId: null as string | null,
      sessionVersion: 0,
    },
    {
      id: "orgonly",
      email: "org@example.com",
      displayName: "Org Only",
      isActive: true,
      facilityId: null,
      roleId: null,
      primaryDepartmentId: null,
      sessionVersion: 0,
    },
    {
      id: "admin",
      email: "admin@example.com",
      displayName: "Admin",
      isActive: true,
      facilityId: "terrace",
      roleId: "role_manager",
      primaryDepartmentId: null,
      sessionVersion: 0,
    },
  ];
  const accesses: Array<{
    id: string;
    userId: string;
    facilityId: string;
    isActive: boolean;
    revokedAt: Date | null;
    grantedByUserId: string | null;
    grantedAt: Date;
  }> = [];
  const periods: RolePeriod[] = [];

  function roleFor(userId: string) {
    const user = users.find((row) => row.id === userId);
    const role = roles.find((row) => row.id === user?.roleId);
    return role ? { key: role.key, isActive: role.isActive } : null;
  }

  const db = {
    $queryRaw: async () => [{ id: "locked" }],
    role: {
      findFirst: async ({ where }: { where: { key: RoleKey; isActive: boolean } }) =>
        roles.find((row) => row.key === where.key && row.isActive === where.isActive) ?? null,
    },
    facility: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const facility = facilities.find((row) => row.id === where.id);
        if (!facility) return null;
        return { ...facility, organization: { id: facility.organizationId } };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const user = users.find((row) => row.id === where.id);
        if (!user) return null;
        const home = facilities.find((row) => row.id === user.facilityId);
        return {
          ...user,
          role: roleFor(user.id),
          facility: home ? { organizationId: home.organizationId } : null,
          facilityAccesses: accesses
            .filter((row) => row.userId === user.id && row.isActive && !row.revokedAt)
            .map((row) => {
              const facility = facilities.find((item) => item.id === row.facilityId)!;
              return { facility: { organizationId: facility.organizationId } };
            }),
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { roleId?: string; sessionVersion?: { increment: number }; isActive?: boolean };
      }) => {
        const user = users.find((row) => row.id === where.id);
        if (!user) throw new Error("missing user");
        if (data.roleId !== undefined) user.roleId = data.roleId;
        if (data.isActive !== undefined) user.isActive = data.isActive;
        if (data.sessionVersion?.increment) user.sessionVersion += data.sessionVersion.increment;
        return { sessionVersion: user.sessionVersion };
      },
    },
    userFacilityAccess: {
      findFirst: async ({
        where,
      }: {
        where: { userId: string; facilityId: string; isActive: boolean; revokedAt: null };
      }) => {
        const row = accesses.find(
          (item) =>
            item.userId === where.userId &&
            item.facilityId === where.facilityId &&
            item.isActive === where.isActive &&
            item.revokedAt === null,
        );
        return row
          ? {
              id: row.id,
              facilityId: row.facilityId,
              rolePeriods: periods
                .filter((period) => period.userFacilityAccessId === row.id)
                .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
            }
          : null;
      },
      findUnique: async ({
        where,
      }: {
        where: { userId_facilityId?: { userId: string; facilityId: string }; id?: string };
      }) => {
        if (where.id) return accesses.find((row) => row.id === where.id) ?? null;
        const key = where.userId_facilityId!;
        return accesses.find((row) => row.userId === key.userId && row.facilityId === key.facilityId) ?? null;
      },
      findMany: async ({
        where,
      }: {
        where: { userId: string; isActive: boolean; revokedAt: null };
      }) =>
        accesses
          .filter(
            (row) =>
              row.userId === where.userId && row.isActive === where.isActive && row.revokedAt === null,
          )
          .map((row) => {
            const facility = facilities.find((item) => item.id === row.facilityId)!;
            return {
              id: row.id,
              facilityId: row.facilityId,
              grantedAt: row.grantedAt,
              facility: {
                id: facility.id,
                displayName: facility.displayName,
                organizationId: facility.organizationId,
                organization: { id: facility.organizationId, name: facility.organizationId, displayName: null },
              },
              rolePeriods: periods.filter((period) => period.userFacilityAccessId === row.id),
            };
          }),
      count: async ({ where }: { where: { userId: string; isActive: boolean; revokedAt: null } }) =>
        accesses.filter(
          (row) => row.userId === where.userId && row.isActive === where.isActive && row.revokedAt === null,
        ).length,
      create: async ({
        data,
      }: {
        data: { userId: string; facilityId: string; isActive: boolean; grantedByUserId: string | null };
      }) => {
        const row = {
          id: nextId("access"),
          userId: data.userId,
          facilityId: data.facilityId,
          isActive: data.isActive,
          revokedAt: null,
          grantedByUserId: data.grantedByUserId,
          grantedAt: new Date(),
        };
        accesses.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<(typeof accesses)[number]> }) => {
        const row = accesses.find((item) => item.id === where.id);
        if (!row) throw new Error("missing access");
        Object.assign(row, data);
        return row;
      },
    },
    userFacilityRolePeriod: {
      findMany: async ({ where }: { where: { userFacilityAccessId: string } }) =>
        periods.filter((period) => period.userFacilityAccessId === where.userFacilityAccessId),
      create: async ({
        data,
      }: {
        data: {
          userFacilityAccessId: string;
          roleKey: RoleKey;
          startsAt: Date;
          endsAt: Date | null;
          createdByUserId?: string | null;
        };
      }) => {
        const row: RolePeriod = {
          id: nextId("period"),
          userFacilityAccessId: data.userFacilityAccessId,
          roleKey: data.roleKey,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          createdByUserId: data.createdByUserId ?? null,
          endedByUserId: null,
        };
        periods.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { endsAt?: Date; endedByUserId?: string | null };
      }) => {
        const row = periods.find((period) => period.id === where.id);
        if (!row) throw new Error("missing period");
        if (data.endsAt !== undefined) row.endsAt = data.endsAt;
        if (data.endedByUserId !== undefined) row.endedByUserId = data.endedByUserId;
        return row;
      },
    },
    _users: users,
    _accesses: accesses,
    _periods: periods,
  };

  return db;
}

async function seedSarah(db: ReturnType<typeof createDb>) {
  await grantUserFacilityAccess(db as never, {
    actorUserId: "admin",
    actorFacilityId: "terrace",
    targetUserId: "sarah",
    targetFacilityId: "terrace",
  });
  await grantUserFacilityAccess(db as never, {
    actorUserId: "admin",
    actorFacilityId: "terrace",
    targetUserId: "sarah",
    targetFacilityId: "hospital",
  });
  await grantUserFacilityAccess(db as never, {
    actorUserId: "admin",
    actorFacilityId: "terrace",
    targetUserId: "admin",
    targetFacilityId: "terrace",
  });
}

test("one-Facility User keeps a single current Manager period", async () => {
  const db = createDb();
  await grantUserFacilityAccess(db as never, {
    actorUserId: "admin",
    actorFacilityId: "terrace",
    targetUserId: "admin",
    targetFacilityId: "terrace",
  });
  const resolved = await resolveCurrentInternalFacilityRole(db as never, {
    userId: "admin",
    facilityId: "terrace",
  });
  assert.equal(resolved?.roleKey, "MANAGER");
  assert.equal(db._periods.filter((period) => period.endsAt === null).length, 1);
});

test("multi-Facility backfill-equivalent grants start with the same RoleKey", async () => {
  const db = createDb();
  await seedSarah(db);
  const terrace = await resolveCurrentInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "terrace",
  });
  const hospital = await resolveCurrentInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "hospital",
  });
  assert.equal(terrace?.roleKey, "MANAGER");
  assert.equal(hospital?.roleKey, "MANAGER");
});

test("one User can hold Manager at Terrace View and STAFF at ECMC Hospital", async () => {
  const db = createDb();
  await seedSarah(db);
  await changeInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "hospital",
    roleKey: "STAFF",
  });

  const terrace = await resolveCurrentInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "terrace",
  });
  const hospital = await resolveCurrentInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "hospital",
  });
  assert.equal(terrace?.roleKey, "MANAGER");
  assert.equal(hospital?.roleKey, "STAFF");
  assert.equal(db._users.find((user) => user.id === "sarah")?.roleId, "role_manager");
});

test("Facility switch mints the destination RoleKey and does not mutate User", async () => {
  const db = createDb();
  await seedSarah(db);
  await changeInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "hospital",
    roleKey: "STAFF",
  });

  const toHospital = await switchActiveFacility(
    {
      userId: "sarah",
      authKind: "user",
      role: "MANAGER",
      sourceFacilityId: "terrace",
      destinationFacilityId: "hospital",
    },
    db as never,
  );
  assert.equal(toHospital.role, "STAFF");
  assert.equal(db._users.find((user) => user.id === "sarah")?.facilityId, "terrace");
  assert.equal(db._users.find((user) => user.id === "sarah")?.roleId, "role_manager");

  const back = await switchActiveFacility(
    {
      userId: "sarah",
      authKind: "user",
      role: "STAFF",
      sourceFacilityId: "hospital",
      destinationFacilityId: "terrace",
    },
    db as never,
  );
  assert.equal(back.role, "MANAGER");
});

test("role change closes history, opens a new period, and does not overlap", async () => {
  const db = createDb();
  await seedSarah(db);
  const changedAt = new Date();
  await changeInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "terrace",
    roleKey: "SUPERVISOR",
    at: changedAt,
    actorUserId: "admin",
  });

  const terracePeriods = db._periods.filter((period) => {
    const access = db._accesses.find((row) => row.id === period.userFacilityAccessId);
    return access?.userId === "sarah" && access.facilityId === "terrace";
  });
  assert.equal(terracePeriods.length, 2);
  assert.equal(terracePeriods.filter((period) => period.endsAt === null).length, 1);
  assert.equal(
    terracePeriods.find((period) => period.endsAt)?.endsAt?.toISOString(),
    changedAt.toISOString(),
  );
  assert.equal(
    terracePeriods.find((period) => period.endsAt === null)?.startsAt.toISOString(),
    changedAt.toISOString(),
  );
  const hospital = await resolveCurrentInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "hospital",
  });
  assert.equal(hospital?.roleKey, "MANAGER");
});

test("stale JWT role is denied after a Facility-local role change", async () => {
  const db = createDb();
  await seedSarah(db);
  const session = {
    uid: "sarah",
    authKind: "user" as const,
    authMethod: "PASSWORD" as const,
    scopeKind: "facility" as const,
    role: "MANAGER" as const,
    name: "Sarah Johnson",
    email: "sarah@example.com",
    facilityId: "terrace",
    sessionVersion: 0,
  };
  const before = await validateSessionAuthority(session, db as never);
  assert.equal(before.valid, true);

  await changeInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "terrace",
    roleKey: "SUPERVISOR",
  });
  const stale = await validateSessionAuthority(session, db as never);
  assert.equal(stale.valid, false);
  assert.equal(stale.valid === false && stale.reason, "ROLE_STALE");
});

test("User.roleId drift does not control active Facility authority", async () => {
  const db = createDb();
  await seedSarah(db);
  await changeInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "terrace",
    roleKey: "STAFF",
  });
  db._users.find((user) => user.id === "sarah")!.roleId = "role_manager";

  const resolved = await resolveCurrentInternalFacilityRole(db as never, {
    userId: "sarah",
    facilityId: "terrace",
  });
  assert.equal(resolved?.roleKey, "STAFF");

  const session = {
    uid: "sarah",
    authKind: "user" as const,
    authMethod: "PASSWORD" as const,
    scopeKind: "facility" as const,
    role: "MANAGER" as const,
    name: "Sarah",
    email: "sarah@example.com",
    facilityId: "terrace",
    sessionVersion: 0,
  };
  const result = await validateSessionAuthority(session, db as never);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "ROLE_STALE");
});

test("ending one grant leaves the other Facility and the User active", async () => {
  const db = createDb();
  await seedSarah(db);
  await revokeUserFacilityAccess(db as never, {
    actorUserId: "admin",
    actorFacilityId: "terrace",
    targetUserId: "sarah",
    targetFacilityId: "hospital",
  });

  assert.equal(
    await resolveCurrentInternalFacilityRole(db as never, { userId: "sarah", facilityId: "hospital" }),
    null,
  );
  assert.equal(
    (await resolveCurrentInternalFacilityRole(db as never, { userId: "sarah", facilityId: "terrace" }))
      ?.roleKey,
    "MANAGER",
  );
  assert.equal(db._users.find((user) => user.id === "sarah")?.isActive, true);
  assert.equal(
    db._periods.filter((period) => {
      const access = db._accesses.find((row) => row.id === period.userFacilityAccessId);
      return access?.facilityId === "hospital" && period.endsAt === null;
    }).length,
    0,
  );
});

test("organization-only Users do not receive fabricated internal roles", async () => {
  const db = createDb();
  const resolved = await resolveCurrentInternalFacilityRole(db as never, {
    userId: "orgonly",
    facilityId: "terrace",
  });
  assert.equal(resolved, null);
  const ensured = await ensureCurrentInternalFacilityRole(db as never, {
    userId: "orgonly",
    facilityId: "terrace",
    roleKey: "MANAGER",
  });
  assert.equal(ensured, null);
  assert.equal(db._periods.length, 0);
});

test("cross-Organization internal grant remains denied", async () => {
  const db = createDb();
  await seedSarah(db);
  await assert.rejects(
    () =>
      grantUserFacilityAccess(db as never, {
        actorUserId: "admin",
        actorFacilityId: "terrace",
        targetUserId: "sarah",
        targetFacilityId: "otherco",
      }),
    /Cross-organization/,
  );
});

test("inactive User is denied even with a current role period", async () => {
  const db = createDb();
  await seedSarah(db);
  db._users.find((user) => user.id === "sarah")!.isActive = false;
  assert.equal(
    await resolveCurrentInternalFacilityRole(db as never, { userId: "sarah", facilityId: "terrace" }),
    null,
  );
});

test("overlapping current periods fail closed", async () => {
  const db = createDb();
  await seedSarah(db);
  const access = db._accesses.find((row) => row.userId === "sarah" && row.facilityId === "terrace")!;
  db._periods.push({
    id: "overlap",
    userFacilityAccessId: access.id,
    roleKey: "STAFF",
    startsAt: at("2020-01-01T00:00:00.000Z"),
    endsAt: null,
    createdByUserId: null,
    endedByUserId: null,
  });
  assert.equal(
    await resolveCurrentInternalFacilityRole(db as never, { userId: "sarah", facilityId: "terrace" }),
    null,
  );
});
