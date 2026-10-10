import assert from "node:assert/strict";
import test from "node:test";

import type { AppJwtPayload, FacilitySession } from "@/lib/auth";

import { validateSessionAuthority, type PrismaLike } from "./session-version";

function userSession(role: AppJwtPayload["role"] = "MANAGER"): AppJwtPayload {
  return {
    uid: "user-1",
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role,
    name: "Manager",
    email: "manager@example.test",
    facilityId: "facility-1",
    sessionVersion: 3,
  } as FacilitySession;
}

function employeeSession(role: AppJwtPayload["role"] = "STAFF"): AppJwtPayload {
  return {
    uid: "employee-1",
    authKind: "employee",
    authMethod: "QUICK_PIN",
    scopeKind: "facility",
    role,
    name: "Employee",
    email: "",
    facilityId: "facility-1",
    sessionVersion: 4,
  } as FacilitySession;
}

function userDb(currentRole: AppJwtPayload["role"], roleActive = true): PrismaLike {
  return {
    user: {
      findUnique: async () => ({
        isActive: true,
        sessionVersion: 3,
        primaryDepartmentId: null,
      }),
    },
    userFacilityAccess: {
      findFirst: async () => ({
        id: "access-1",
        facilityId: "facility-1",
        rolePeriods: [
          {
            id: "period-1",
            roleKey: currentRole,
            startsAt: new Date("2020-01-01T00:00:00.000Z"),
            endsAt: null,
          },
        ],
      }),
    },
    role: {
      findFirst: async ({ where }: { where: { key: string; isActive: boolean } }) =>
        where.key === currentRole && where.isActive === roleActive && roleActive
          ? { id: "role-1" }
          : null,
    },
  } as unknown as PrismaLike;
}

function employeeDb(currentRole: AppJwtPayload["role"]): PrismaLike {
  return {
    employee: {
      findUnique: async () => ({
        status: "ACTIVE",
        sessionVersion: 4,
        facilityId: "facility-1",
        roleType: currentRole,
        primaryDepartmentId: null,
        employeeDepartments: [],
      }),
    },
  } as unknown as PrismaLike;
}

test("password session fails closed when its database role changed", async () => {
  const result = await validateSessionAuthority(userSession("MANAGER"), userDb("STAFF"));
  assert.deepEqual(result, { valid: false, reason: "ROLE_STALE" });
});

test("password session fails closed when its database role is inactive", async () => {
  const result = await validateSessionAuthority(userSession("MANAGER"), userDb("MANAGER", false));
  assert.deepEqual(result, { valid: false, reason: "FACILITY_ACCESS_REVOKED" });
});

test("PIN session fails closed when its database role changed", async () => {
  const result = await validateSessionAuthority(employeeSession("STAFF"), employeeDb("MANAGER"));
  assert.deepEqual(result, { valid: false, reason: "ROLE_STALE" });
});

test("privileged roles cannot retain an existing Quick PIN session", async () => {
  const result = await validateSessionAuthority(employeeSession("MANAGER"), employeeDb("MANAGER"));
  assert.deepEqual(result, { valid: false, reason: "AUTH_METHOD_NOT_ALLOWED" });
});

test("sessions remain valid when database role and token role agree", async () => {
  assert.equal((await validateSessionAuthority(userSession(), userDb("MANAGER"))).valid, true);
  assert.equal((await validateSessionAuthority(employeeSession(), employeeDb("STAFF"))).valid, true);
});
