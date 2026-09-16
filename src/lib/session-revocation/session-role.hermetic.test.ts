import assert from "node:assert/strict";
import test from "node:test";

import type { AppJwtPayload } from "@/lib/auth";

import { validateSessionAuthority, type PrismaLike } from "./session-version";

function userSession(role: AppJwtPayload["role"] = "MANAGER"): AppJwtPayload {
  return {
    uid: "user-1",
    authKind: "user",
    authMethod: "PASSWORD",
    role,
    name: "Manager",
    email: "manager@example.test",
    facilityId: "facility-1",
    sessionVersion: 3,
  } as AppJwtPayload;
}

function employeeSession(role: AppJwtPayload["role"] = "STAFF"): AppJwtPayload {
  return {
    uid: "employee-1",
    authKind: "employee",
    authMethod: "QUICK_PIN",
    role,
    name: "Employee",
    email: "",
    facilityId: "facility-1",
    sessionVersion: 4,
  } as AppJwtPayload;
}

function userDb(currentRole: AppJwtPayload["role"], roleActive = true): PrismaLike {
  return {
    user: {
      findUnique: async () => ({
        isActive: true,
        sessionVersion: 3,
        facilityId: "facility-1",
        primaryDepartmentId: null,
        role: { key: currentRole, isActive: roleActive },
        facilityAccesses: [],
      }),
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
  assert.deepEqual(result, { valid: false, reason: "IDENTITY_INACTIVE" });
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
