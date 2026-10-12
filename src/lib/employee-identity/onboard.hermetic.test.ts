import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { EmployeeStatus, EmploymentType, RoleKey } from "@prisma/client";

import { onboardFacilityEmployee, previewEmployeeAccount } from "./onboard";
import { EmployeeIdentityError } from "./types";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

type Period = {
  id: string;
  userFacilityAccessId: string;
  roleKey: string;
  startsAt: Date;
  endsAt: Date | null;
};

function buildDb(seed?: {
  users?: Array<{
    id: string;
    email: string;
    displayName: string;
    isActive?: boolean;
    passwordHash?: string | null;
    emailVerifiedAt?: Date | null;
    createdAt?: Date;
    facilityId?: string | null;
    roleId?: string;
  }>;
  employees?: Array<{
    id: string;
    facilityId: string;
    email?: string | null;
    userId?: string | null;
    status?: EmployeeStatus;
  }>;
}) {
  let seq = 1;
  const id = (prefix: string) => `${prefix}_${seq++}`;
  const roles = [{ id: "role_staff", key: "STAFF", isActive: true }];
  const users = [...(seed?.users ?? [])].map((user) => ({
    isActive: true,
    passwordHash: null as string | null,
    emailVerifiedAt: null as Date | null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    facilityId: "fac_1" as string | null,
    roleId: "role_staff",
    ...user,
  }));
  const employees: Array<Record<string, unknown>> = [...(seed?.employees ?? [])];
  const accesses: Array<Record<string, unknown>> = [];
  const periods: Period[] = [];

  const db = {
    role: {
      findFirst: async ({ where }: { where: { key: string; isActive?: boolean } }) =>
        roles.find((role) => role.key === where.key && (where.isActive == null || role.isActive === where.isActive)) ??
        null,
      findUnique: async ({ where }: { where: { key: string } }) =>
        roles.find((role) => role.key === where.key) ?? null,
    },
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        users.find((row) => row.id === where.id || row.email === where.email) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (users.some((row) => row.email === data.email)) {
          const error = new Error("Unique constraint failed") as Error & { code: string };
          error.name = "PrismaClientKnownRequestError";
          Object.assign(error, { code: "P2002" });
          throw error;
        }
        const row = {
          id: id("user"),
          isActive: true,
          passwordHash: null,
          emailVerifiedAt: null,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          ...data,
        };
        users.push(row as (typeof users)[number]);
        return { id: row.id };
      },
    },
    employee: {
      findFirst: async ({
        where,
      }: {
        where: {
          facilityId: string;
          OR?: Array<{ email?: { equals: string; mode?: string }; userId?: string }>;
        };
      }) =>
        employees.find((row) => {
          if (row.facilityId !== where.facilityId) return false;
          if (!where.OR) return true;
          return where.OR.some((clause) => {
            if (clause.userId) return row.userId === clause.userId;
            if (clause.email?.equals) {
              return String(row.email ?? "").toLowerCase() === clause.email.equals.toLowerCase();
            }
            return false;
          });
        }) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("emp"), ...data };
        employees.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = employees.find((item) => item.id === where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return { id: row.id };
      },
    },
    userFacilityAccess: {
      findUnique: async ({ where }: { where: { userId_facilityId: { userId: string; facilityId: string } } }) =>
        accesses.find(
          (row) =>
            row.userId === where.userId_facilityId.userId && row.facilityId === where.userId_facilityId.facilityId,
        ) ?? null,
      findFirst: async ({ where }: { where: { userId: string; facilityId: string; isActive?: boolean } }) => {
        const access = accesses.find(
          (row) =>
            row.userId === where.userId &&
            row.facilityId === where.facilityId &&
            (where.isActive == null || row.isActive === where.isActive) &&
            !row.revokedAt,
        );
        if (!access) return null;
        return {
          ...access,
          rolePeriods: periods.filter((period) => period.userFacilityAccessId === access.id),
        };
      },
      findMany: async ({ where }: { where: { userId: string; isActive?: boolean } }) =>
        accesses.filter(
          (row) => row.userId === where.userId && (where.isActive == null || row.isActive === where.isActive),
        ),
      create: async ({ data }: { data: { userId: string; facilityId: string } }) => {
        const row = { id: id("access"), isActive: true, revokedAt: null, ...data };
        accesses.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = accesses.find((item) => item.id === where.id);
        if (!row) throw new Error("missing access");
        Object.assign(row, data);
        return row;
      },
    },
    userFacilityRolePeriod: {
      create: async ({ data }: { data: Omit<Period, "id"> }) => {
        const row = { id: id("period"), ...data };
        periods.push(row);
        return row;
      },
    },
    $queryRaw: async () => [],
    $transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => {
      const snapshot = {
        users: users.map((row) => ({ ...row })),
        employees: employees.map((row) => ({ ...row })),
        accesses: accesses.map((row) => ({ ...row })),
        periods: periods.map((row) => ({ ...row })),
      };
      try {
        return await fn(db);
      } catch (error) {
        users.splice(0, users.length, ...snapshot.users);
        employees.splice(0, employees.length, ...snapshot.employees);
        accesses.splice(0, accesses.length, ...snapshot.accesses);
        periods.splice(0, periods.length, ...snapshot.periods);
        throw error;
      }
    },
  };

  return { db: db as never, users, employees, accesses, periods };
}

const baseInput = {
  facilityId: "fac_1",
  actorUserId: "manager_1",
  firstName: "Sam",
  lastName: "Staff",
  email: "sam@example.com",
  roleType: RoleKey.STAFF,
  employmentType: EmploymentType.FULL_TIME,
  status: EmployeeStatus.ACTIVE,
  pinDigest: "digest_sam",
  confirmExistingUser: false,
};

test("new email creates User, Employee, grant, role period, and PIN", async () => {
  const world = buildDb();
  const result = await onboardFacilityEmployee(world.db, baseInput);
  assert.equal(result.userCreated, true);
  assert.equal(result.reusedExistingUser, false);
  assert.equal(result.userActivated, false);
  assert.equal(world.users.length, 1);
  assert.equal(world.users[0]?.passwordHash, null);
  assert.equal(world.users[0]?.emailVerifiedAt, null);
  assert.equal(world.employees[0]?.userId, result.userId);
  assert.equal(world.employees[0]?.pinDigest, "digest_sam");
  assert.equal(world.accesses.length, 1);
  assert.equal(world.periods[0]?.roleKey, "STAFF");
});

test("activated User is reused after confirmation and does not create another User", async () => {
  const world = buildDb({
    users: [
      {
        id: "user_sarah",
        email: "sarah@example.com",
        displayName: "Sarah Johnson",
        passwordHash: "hash",
        emailVerifiedAt: new Date("2025-01-01"),
        createdAt: new Date("2025-01-01"),
      },
    ],
  });
  await assert.rejects(
    () => onboardFacilityEmployee(world.db, { ...baseInput, email: "sarah@example.com" }),
    (error: unknown) => error instanceof EmployeeIdentityError && error.code === "EXISTING_USER",
  );
  const result = await onboardFacilityEmployee(world.db, {
    ...baseInput,
    email: "sarah@example.com",
    confirmExistingUser: true,
  });
  assert.equal(result.userId, "user_sarah");
  assert.equal(result.userCreated, false);
  assert.equal(result.userActivated, true);
  assert.equal(world.users.length, 1);
  assert.equal(world.users[0]?.createdAt.toISOString(), "2025-01-01T00:00:00.000Z");
  assert.equal(world.employees[0]?.userId, "user_sarah");
});

test("pending User is reused across Facilities without resetting createdAt", async () => {
  const createdAt = new Date("2026-02-01T00:00:00.000Z");
  const world = buildDb({
    users: [
      {
        id: "user_pending",
        email: "pending@example.com",
        displayName: "Pat Pending",
        createdAt,
        facilityId: "fac_a",
      },
    ],
    employees: [{ id: "emp_a", facilityId: "fac_a", userId: "user_pending", email: "pending@example.com" }],
  });
  const result = await onboardFacilityEmployee(world.db, {
    ...baseInput,
    facilityId: "fac_b",
    email: "pending@example.com",
    confirmExistingUser: true,
  });
  assert.equal(result.userId, "user_pending");
  assert.equal(result.userCreated, false);
  assert.equal(world.users.length, 1);
  assert.equal(world.users[0]?.createdAt.toISOString(), createdAt.toISOString());
  assert.equal(world.employees.filter((row) => row.facilityId === "fac_b").length, 1);
  assert.equal(world.employees.length, 2);
});

test("rehire of historical unlinked Employee attaches a User", async () => {
  const world = buildDb({
    employees: [
      {
        id: "emp_old",
        facilityId: "fac_1",
        email: "sam@example.com",
        userId: null,
        status: EmployeeStatus.TERMINATED,
      },
    ],
  });
  const result = await onboardFacilityEmployee(world.db, baseInput);
  assert.equal(result.employeeId, "emp_old");
  assert.equal(world.employees.length, 1);
  assert.equal(world.employees[0]?.userId, result.userId);
  assert.ok(result.userId);
});

test("preview returns only displayName and email", async () => {
  const world = buildDb({
    users: [
      {
        id: "user_sarah",
        email: "sarah@example.com",
        displayName: "Sarah Johnson",
        passwordHash: "hash",
        emailVerifiedAt: new Date(),
      },
    ],
  });
  const preview = await previewEmployeeAccount(world.db, "Sarah@example.com");
  assert.deepEqual(Object.keys(preview).sort(), ["activated", "displayName", "email", "exists"]);
  assert.equal(preview.exists, true);
  assert.equal(preview.displayName, "Sarah Johnson");
  assert.equal(preview.email, "sarah@example.com");
  assert.equal(preview.activated, true);
});

test("transaction rollback leaves no orphan User or grant from a new-employee create", async () => {
  const world = buildDb();
  const original = world.db.userFacilityAccess.create;
  world.db.userFacilityAccess.create = async () => {
    throw new Error("grant failed");
  };
  await assert.rejects(() => world.db.$transaction((tx) => onboardFacilityEmployee(tx, baseInput)));
  world.db.userFacilityAccess.create = original;
  assert.equal(world.users.length, 0);
  assert.equal(world.employees.length, 0);
  assert.equal(world.accesses.length, 0);
});

test("new-employee create no longer offers PIN-only and CSV cannot create unlinked rows", () => {
  const create = source("src/app/(protected)/employees/actions.ts");
  const drawer = source("src/components/create-employee-drawer.tsx");
  const csv = source("src/app/(protected)/employees/csv-import-actions.ts");
  const pin = source("src/app/api/auth/pin-login/route.ts");
  const login = source("src/app/api/auth/login/route.ts");
  const invite = source("src/app/api/auth/account-invite/confirm/route.ts");
  assert.match(create, /onboardFacilityEmployee/);
  assert.match(create, /issueAndSendAccountInvite/);
  assert.ok(create.indexOf("prisma.$transaction") < create.indexOf("issueAndSendAccountInvite({"));
  assert.match(create, /if \(result\.userCreated\)/);
  assert.doesNotMatch(create, /accessMethod/);
  assert.match(create, /previewEmployeeAccountAction[\s\S]*requireAtLeastRole\(session\.role, "MANAGER"\)/);
  assert.match(create, /createEmployeeAction[\s\S]*requireAtLeastRole\(session\.role, "MANAGER"\)/);
  assert.doesNotMatch(drawer, /PIN_ONLY|EMAIL_PASSWORD|Access method/);
  assert.match(csv, /Add new employees from Add employee/);
  assert.doesNotMatch(csv, /tx\.employee\.create/);
  assert.match(pin, /if \(pinActivationDenied/);
  assert.match(pin, /ACCOUNT_ACTIVATION_REQUIRED_MESSAGE/);
  assert.match(pin, /uid: employee\.id/);
  assert.match(pin, /authKind: "employee"/);
  assert.match(pin, /authMethod: "QUICK_PIN"/);
  assert.ok(pin.indexOf("if (pinActivationDenied") < pin.indexOf("createSessionToken({"));
  assert.doesNotMatch(
    pin.slice(pin.indexOf("if (pinActivationDenied"), pin.indexOf("createSessionToken({")),
    /registerAuthFailure/,
  );
  assert.match(login, /isGlobalAccountActivated/);
  assert.match(login, /INVITE_PENDING/);
  assert.match(invite, /passwordHash,/);
  assert.match(invite, /emailVerifiedAt: now/);
  assert.doesNotMatch(invite, /pinDigest/);
  const resend = create.slice(create.indexOf("resendEmployeeActivationAction"));
  assert.match(resend, /issueAndSendAccountInvite/);
  assert.doesNotMatch(resend, /createdAt/);
});

test("User creation alone does not create Facility authority", async () => {
  const world = buildDb();
  await world.db.user.create({
    data: {
      email: "orphan@example.com",
      displayName: "Orphan",
      passwordHash: null,
      facilityId: "fac_1",
      roleId: "role_staff",
    },
  });
  assert.equal(world.users.length, 1);
  assert.equal(world.accesses.length, 0);
  assert.equal(world.employees.length, 0);
  assert.equal(world.periods.length, 0);
});
