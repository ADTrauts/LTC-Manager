import assert from "node:assert/strict";
import test from "node:test";

import { EmployeeStatus, type RoleKey } from "@prisma/client";

import { acceptEmployeeUserLinkInvitation, issueEmployeeUserLinkInvitation } from "./invitations";
import { endEmployeeEmployment, revokeInternalAccessForEmploymentEnd } from "./lifecycle";
import { findEmployeeForUserFacility } from "./lookup";
import { EmployeeIdentityError } from "./types";

type Period = { id: string; roleKey: RoleKey; startsAt: Date; endsAt: Date | null };
type Grant = {
  id: string;
  userId: string;
  facilityId: string;
  isActive: boolean;
  revokedAt: Date | null;
  rolePeriods: Period[];
};
type Employee = {
  id: string;
  facilityId: string;
  userId: string | null;
  email: string | null;
  status: EmployeeStatus;
  sessionVersion: number;
};
type Invitation = {
  id: string;
  employeeId: string;
  facilityId: string;
  targetEmailNormalized: string;
  intendedRoleKey: RoleKey;
  tokenHash: string;
  expiresAt: Date;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  invitedByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
};

function memoryDb() {
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      isActive: boolean;
      facilityId: string | null;
      organizationId: string | null;
      sessionVersion: number;
    }
  >();
  const facilities = new Map<string, { id: string; organizationId: string }>();
  const grants: Grant[] = [];
  const employees: Employee[] = [];
  const invitations: Invitation[] = [];
  const memberships: Array<{ userId: string; organizationId: string; active: boolean }> = [];
  const partners: Array<{ userId: string; facilityId: string; active: boolean }> = [];
  let seq = 1;
  const id = (p: string) => `${p}_${seq++}`;

  const db = {
    user: {
      findUnique: async ({ where, select }: { where: { id?: string; email?: string }; select?: Record<string, unknown> }) => {
        const user = where.id
          ? users.get(where.id)
          : [...users.values()].find((row) => row.email === where.email);
        if (!user) return null;
        if (select && "facilityAccesses" in select) {
          return {
            ...user,
            facility: user.facilityId
              ? { organizationId: facilities.get(user.facilityId)?.organizationId }
              : null,
            facilityAccesses: grants
              .filter((g) => g.userId === user.id && g.isActive && !g.revokedAt)
              .map((g) => ({
                facilityId: g.facilityId,
                facility: { organizationId: facilities.get(g.facilityId)?.organizationId },
              })),
          };
        }
        return user;
      },
    },
    facility: {
      findUnique: async ({ where }: { where: { id: string } }) => facilities.get(where.id) ?? null,
    },
    employee: {
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          userId?: string;
          facilityId?: string;
          status?: EmployeeStatus;
        };
      }) =>
        employees.find((row) => {
          if (where.id && row.id !== where.id) return false;
          if (where.userId && row.userId !== where.userId) return false;
          if (where.facilityId && row.facilityId !== where.facilityId) return false;
          if (where.status && row.status !== where.status) return false;
          return true;
        }) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        employees.find((row) => row.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Employee> & { sessionVersion?: number | { increment: number } };
      }) => {
        const row = employees.find((item) => item.id === where.id);
        if (!row) throw new Error("missing employee");
        const next = { ...data };
        if (next.sessionVersion && typeof next.sessionVersion === "object" && "increment" in next.sessionVersion) {
          row.sessionVersion += next.sessionVersion.increment;
          delete next.sessionVersion;
        }
        Object.assign(row, next);
        return row;
      },
    },
    userFacilityAccess: {
      findFirst: async ({
        where,
      }: {
        where: { userId?: string; facilityId?: string; isActive?: boolean; revokedAt?: null };
      }) =>
        grants.find(
          (row) =>
            (!where.userId || row.userId === where.userId) &&
            (!where.facilityId || row.facilityId === where.facilityId) &&
            (where.isActive === undefined || row.isActive === where.isActive) &&
            (where.revokedAt === undefined || row.revokedAt === where.revokedAt),
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Grant> }) => {
        const row = grants.find((item) => item.id === where.id);
        if (!row) throw new Error("missing grant");
        Object.assign(row, data);
        return row;
      },
    },
    userFacilityRolePeriod: {
      update: async ({ where, data }: { where: { id: string }; data: { endsAt: Date } }) => {
        for (const grant of grants) {
          const period = grant.rolePeriods.find((item) => item.id === where.id);
          if (period) Object.assign(period, data);
        }
      },
    },
    employeeUserLinkInvitation: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        invitations.find((row) => row.tokenHash === where.tokenHash) ?? null,
      findFirst: async ({ where }: { where: { employeeId: string; status: string } }) =>
        invitations.find((row) => row.employeeId === where.employeeId && row.status === where.status) ??
        null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { employeeId: string; status: string };
        data: Partial<Invitation>;
      }) => {
        for (const row of invitations) {
          if (row.employeeId === where.employeeId && row.status === where.status) Object.assign(row, data);
        }
      },
      create: async ({ data }: { data: Omit<Invitation, "id" | "acceptedByUserId" | "acceptedAt" | "status"> & { status?: Invitation["status"] } }) => {
        const row: Invitation = {
          id: id("inv"),
          acceptedByUserId: null,
          acceptedAt: null,
          status: "PENDING",
          ...data,
        };
        invitations.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Invitation> }) => {
        const row = invitations.find((item) => item.id === where.id);
        if (!row) throw new Error("missing invitation");
        Object.assign(row, data);
        return row;
      },
    },
    $queryRaw: async () => [],
  };

  function addUser(input: {
    id: string;
    email: string;
    facilityId?: string | null;
    organizationId?: string | null;
    isActive?: boolean;
  }) {
    users.set(input.id, {
      id: input.id,
      email: input.email,
      isActive: input.isActive ?? true,
      facilityId: input.facilityId ?? null,
      organizationId: input.organizationId ?? null,
      sessionVersion: 0,
    });
  }
  function addFacility(id: string, organizationId: string) {
    facilities.set(id, { id, organizationId });
  }
  function addGrant(userId: string, facilityId: string, roleKey: RoleKey = "MANAGER") {
    grants.push({
      id: id("ufa"),
      userId,
      facilityId,
      isActive: true,
      revokedAt: null,
      rolePeriods: [{ id: id("p"), roleKey, startsAt: new Date("2026-01-01"), endsAt: null }],
    });
  }
  function addEmployee(input: Omit<Employee, "sessionVersion"> & { sessionVersion?: number }) {
    const row = { sessionVersion: 0, ...input };
    employees.push(row);
    return row;
  }

  return {
    db,
    users,
    grants,
    employees,
    invitations,
    memberships,
    partners,
    addUser,
    addFacility,
    addGrant,
    addEmployee,
  };
}

test("one User links to Employees at two Facilities", async () => {
  const f = memoryDb();
  f.addEmployee({ id: "emp_tv", facilityId: "terrace", userId: "sarah", email: "sarah@ecmc.test", status: EmployeeStatus.ACTIVE });
  f.addEmployee({ id: "emp_ecmc", facilityId: "hospital", userId: "sarah", email: "sarah@ecmc.test", status: EmployeeStatus.ACTIVE });
  const terrace = await findEmployeeForUserFacility(f.db as never, { userId: "sarah", facilityId: "terrace" });
  const hospital = await findEmployeeForUserFacility(f.db as never, { userId: "sarah", facilityId: "hospital" });
  assert.equal(terrace?.id, "emp_tv");
  assert.equal(hospital?.id, "emp_ecmc");
});

test("same Facility cannot have two Employees for one User", async () => {
  const f = memoryDb();
  f.addEmployee({ id: "emp_a", facilityId: "terrace", userId: "sarah", email: "a@x.test", status: EmployeeStatus.ACTIVE });
  const other = f.employees.find((row) => row.facilityId === "terrace" && row.userId === "sarah" && row.id !== "emp_b");
  assert.ok(other);
  assert.equal(
    f.employees.filter((row) => row.facilityId === "terrace" && row.userId === "sarah").length,
    1,
  );
});

test("termination keeps userId, revokes only that Facility grant, and leaves User active", async () => {
  const f = memoryDb();
  f.addUser({ id: "sarah", email: "sarah@ecmc.test", facilityId: "terrace", organizationId: "ecmc" });
  f.addFacility("terrace", "ecmc");
  f.addFacility("hospital", "ecmc");
  f.addGrant("sarah", "terrace", "MANAGER");
  f.addGrant("sarah", "hospital", "STAFF");
  f.addEmployee({ id: "emp_tv", facilityId: "terrace", userId: "sarah", email: "sarah@ecmc.test", status: EmployeeStatus.ACTIVE });
  f.addEmployee({ id: "emp_ecmc", facilityId: "hospital", userId: "sarah", email: "sarah@ecmc.test", status: EmployeeStatus.ACTIVE });
  f.memberships.push({ userId: "sarah", organizationId: "metz", active: true });
  f.partners.push({ userId: "sarah", facilityId: "highpointe", active: true });

  const result = await endEmployeeEmployment(f.db as never, {
    employeeId: "emp_tv",
    facilityId: "terrace",
    actorUserId: "admin",
  });

  assert.equal(result.userId, "sarah");
  assert.equal(result.accessRevoked, true);
  assert.equal(f.employees[0]?.status, EmployeeStatus.TERMINATED);
  assert.equal(f.employees[0]?.userId, "sarah");
  assert.equal(f.users.get("sarah")?.isActive, true);
  assert.equal(f.users.get("sarah")?.sessionVersion, 0);
  assert.equal(f.grants.find((g) => g.facilityId === "terrace")?.isActive, false);
  assert.equal(f.grants.find((g) => g.facilityId === "hospital")?.isActive, true);
  assert.equal(f.employees[1]?.status, EmployeeStatus.ACTIVE);
  assert.equal(f.memberships[0]?.active, true);
  assert.equal(f.partners[0]?.active, true);
});

test("independent grant revoke does not terminate Employee", async () => {
  const f = memoryDb();
  f.addUser({ id: "sarah", email: "sarah@ecmc.test", facilityId: "terrace" });
  f.addFacility("terrace", "ecmc");
  f.addGrant("sarah", "terrace");
  f.addEmployee({ id: "emp_tv", facilityId: "terrace", userId: "sarah", email: "sarah@ecmc.test", status: EmployeeStatus.ACTIVE });
  await revokeInternalAccessForEmploymentEnd(f.db as never, { userId: "sarah", facilityId: "terrace" });
  assert.equal(f.employees[0]?.status, EmployeeStatus.ACTIVE);
  assert.equal(f.grants[0]?.isActive, false);
});

test("existing User invite stays unlinked until the invited User accepts", async () => {
  const f = memoryDb();
  f.addUser({ id: "sarah", email: "sarah@ecmc.test", facilityId: "terrace", organizationId: "ecmc" });
  f.addUser({ id: "intruder", email: "other@x.test", facilityId: "terrace", organizationId: "ecmc" });
  f.addFacility("hospital", "ecmc");
  f.addFacility("terrace", "ecmc");
  f.addGrant("sarah", "hospital", "STAFF");
  f.addEmployee({ id: "emp_ecmc", facilityId: "hospital", userId: null, email: "sarah@ecmc.test", status: EmployeeStatus.ACTIVE });

  const issued = await issueEmployeeUserLinkInvitation(f.db as never, {
    employeeId: "emp_ecmc",
    facilityId: "hospital",
    targetEmail: "sarah@ecmc.test",
    intendedRoleKey: "STAFF",
    invitedByUserId: "admin",
  });
  assert.equal(f.employees[0]?.userId, null);
  await assert.rejects(
    () =>
      acceptEmployeeUserLinkInvitation(f.db as never, {
        rawToken: issued.rawToken,
        authenticatedUserId: "intruder",
      }),
    (error: unknown) => error instanceof EmployeeIdentityError && error.code === "WRONG_USER",
  );

  const accepted = await acceptEmployeeUserLinkInvitation(f.db as never, {
    rawToken: issued.rawToken,
    authenticatedUserId: "sarah",
  });
  assert.equal(accepted.userId, "sarah");
  assert.equal(f.employees[0]?.userId, "sarah");
});

test("terminated Employee cannot accept a link invitation", async () => {
  const f = memoryDb();
  f.addUser({ id: "sarah", email: "sarah@ecmc.test", facilityId: "terrace", organizationId: "ecmc" });
  f.addFacility("terrace", "ecmc");
  f.addGrant("sarah", "terrace");
  f.addEmployee({ id: "emp_tv", facilityId: "terrace", userId: null, email: "sarah@ecmc.test", status: EmployeeStatus.ACTIVE });
  const issued = await issueEmployeeUserLinkInvitation(f.db as never, {
    employeeId: "emp_tv",
    facilityId: "terrace",
    targetEmail: "sarah@ecmc.test",
    intendedRoleKey: "MANAGER",
    invitedByUserId: "admin",
  });
  f.employees[0]!.status = EmployeeStatus.TERMINATED;
  await assert.rejects(
    () =>
      acceptEmployeeUserLinkInvitation(f.db as never, {
        rawToken: issued.rawToken,
        authenticatedUserId: "sarah",
      }),
    (error: unknown) => error instanceof EmployeeIdentityError && error.code === "EMPLOYEE_INACTIVE",
  );
  assert.equal(f.employees[0]?.userId, null);
});

test("cross-Organization User cannot accept an internal Employee link", async () => {
  const f = memoryDb();
  f.addUser({ id: "metz", email: "pat@metz.test", facilityId: "metz_hq", organizationId: "metz" });
  f.addFacility("metz_hq", "metz");
  f.addFacility("hospital", "ecmc");
  f.addEmployee({ id: "emp_ecmc", facilityId: "hospital", userId: null, email: "pat@metz.test", status: EmployeeStatus.ACTIVE });
  const issued = await issueEmployeeUserLinkInvitation(f.db as never, {
    employeeId: "emp_ecmc",
    facilityId: "hospital",
    targetEmail: "pat@metz.test",
    intendedRoleKey: "STAFF",
    invitedByUserId: "admin",
  });
  await assert.rejects(
    () =>
      acceptEmployeeUserLinkInvitation(f.db as never, {
        rawToken: issued.rawToken,
        authenticatedUserId: "metz",
      }),
    (error: unknown) => error instanceof EmployeeIdentityError && error.code === "CROSS_ORGANIZATION",
  );
});
