import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { FacilitySession } from "@/lib/auth";

import {
  requireAssignmentManage,
  resolveAssignmentAuthority,
  type AssignmentAuthorityDecision,
} from "./assignment-authority";

const SOURCE = readFileSync(
  join(process.cwd(), "src/lib/scheduling/operational-assignments/assignment-authority.ts"),
  "utf8",
);

const FACILITY_A = "fac_home_a";
const FACILITY_B = "fac_current_b";
const DIETARY_A = "dept_dietary_a";
const DIETARY_B = "dept_dietary_b";
const EVS_B = "dept_evs_b";

function session(
  overrides: Partial<FacilitySession> & Pick<FacilitySession, "facilityId" | "role">,
): FacilitySession {
  return {
    uid: overrides.uid ?? "user_andrew",
    authKind: overrides.authKind ?? "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    scopeKind: "facility",
    role: overrides.role,
    name: overrides.name ?? "Andrew",
    email: overrides.email ?? "andrew@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
    ...overrides,
  } as FacilitySession;
}

function departmentStore(
  rows: Array<{ id: string; facilityId: string; key: string; isActive?: boolean }>,
) {
  return {
    facilityBilling: { findUnique: async () => null },
    facilityDepartmentEntitlement: { findMany: async () => [] },
    department: {
      findMany: async ({ where }: { where: { facilityId: string } }) => rows.filter((row) => row.facilityId === where.facilityId).map((row) => ({ ...row, name: row.key, sortOrder: 0, isActive: row.isActive !== false, showInEmployeeApp: true })),
      async findFirst(args: {
        where: { id: string; facilityId: string; isActive: true };
        select: { id: true; key: true };
      }) {
        const match = rows.find(
          (row) =>
            row.id === args.where.id &&
            row.facilityId === args.where.facilityId &&
            row.isActive !== false,
        );
        return match ? { id: match.id, key: match.key } : null;
      },
    },
  } as never;
}

const world = departmentStore([
  { id: DIETARY_A, facilityId: FACILITY_A, key: "DIETARY" },
  { id: DIETARY_B, facilityId: FACILITY_B, key: "DIETARY" },
  { id: EVS_B, facilityId: FACILITY_B, key: "CUSTOM" },
]);

test("STAFF authority decision cannot manage Assignments", () => {
  const staff: AssignmentAuthorityDecision = {
    canViewOwn: true,
    canViewDepartment: false,
    canManage: false,
    canConfirm: false,
    canReopen: false,
    canOverride: false,
    reason: null,
  };
  assert.throws(() => requireAssignmentManage(staff), /Insufficient|authority/i);
});

test("SUPERVISOR authority decision can manage Assignments", () => {
  const supervisor: AssignmentAuthorityDecision = {
    canViewOwn: true,
    canViewDepartment: true,
    canManage: true,
    canConfirm: true,
    canReopen: true,
    canOverride: true,
    reason: null,
  };
  assert.doesNotThrow(() => requireAssignmentManage(supervisor));
});

test("Facility Administrator denial reason is explicit when manage is false", () => {
  const fa: AssignmentAuthorityDecision = {
    canViewOwn: true,
    canViewDepartment: false,
    canManage: false,
    canConfirm: false,
    canReopen: false,
    canOverride: false,
    reason: "Facility Administrator status alone does not grant Dietary Assignment authority.",
  };
  assert.throws(() => requireAssignmentManage(fa), /Facility Administrator/);
});

test("non-home FA may manage Dietary assignments at the current Facility", async () => {
  const decision = await resolveAssignmentAuthority({
    session: session({
      facilityId: FACILITY_B,
      role: "FACILITY_ADMINISTRATOR",
      primaryDepartmentId: DIETARY_A,
    }),
    departmentId: DIETARY_B,
    facilityId: FACILITY_B,
    db: world,
  });
  assert.equal(decision.canManage, true);
  assert.equal(decision.canViewDepartment, true);
  assert.equal(decision.reason, null);
});

test("home FA may still manage Dietary assignments at the home Facility", async () => {
  const decision = await resolveAssignmentAuthority({
    session: session({
      facilityId: FACILITY_A,
      role: "FACILITY_ADMINISTRATOR",
      primaryDepartmentId: DIETARY_A,
    }),
    departmentId: DIETARY_A,
    facilityId: FACILITY_A,
    db: world,
  });
  assert.equal(decision.canManage, true);
  assert.equal(decision.reason, null);
});

test("STAFF is denied management at a valid Dietary Department", async () => {
  const decision = await resolveAssignmentAuthority({
    session: session({
      facilityId: FACILITY_B,
      role: "STAFF",
    }),
    departmentId: DIETARY_B,
    facilityId: FACILITY_B,
    db: world,
  });
  assert.equal(decision.canManage, false);
  assert.equal(decision.canViewOwn, true);
});

test("MANAGER and SUPERVISOR management is unchanged", async () => {
  for (const role of ["MANAGER", "SUPERVISOR"] as const) {
    const decision = await resolveAssignmentAuthority({
      session: session({
        facilityId: FACILITY_B,
        role,
      }),
      departmentId: DIETARY_B,
      facilityId: FACILITY_B,
      db: world,
    });
    assert.equal(decision.canManage, true, role);
    assert.equal(decision.reason, null, role);
  }
});

test("target Department at another Facility is denied", async () => {
  const decision = await resolveAssignmentAuthority({
    session: session({
      facilityId: FACILITY_B,
      role: "FACILITY_ADMINISTRATOR",
    }),
    departmentId: DIETARY_A,
    facilityId: FACILITY_B,
    db: world,
  });
  assert.equal(decision.canManage, false);
  assert.match(String(decision.reason), /Department not found/);
});

test("FA cannot manage a non-Dietary Department at the current Facility", async () => {
  const decision = await resolveAssignmentAuthority({
    session: session({
      facilityId: FACILITY_B,
      role: "FACILITY_ADMINISTRATOR",
    }),
    departmentId: EVS_B,
    facilityId: FACILITY_B,
    db: world,
  });
  assert.equal(decision.canManage, false);
  assert.match(String(decision.reason), /Facility Administrator/);
});

test("partner-shaped session cannot use internal assignment authority", async () => {
  const decision = await resolveAssignmentAuthority({
    session: {
      uid: "user_partner",
      authKind: "user",
      authMethod: "PASSWORD",
      scopeKind: "facility",
      accessKind: "partner",
      name: "Andrew",
      email: "andrew@example.com",
      facilityId: FACILITY_B,
      partnerOrganizationId: "org_metz",
      facilityPartnerOrganizationId: "fpo_metz_b",
      sessionVersion: 1,
    } as unknown as FacilitySession,
    departmentId: DIETARY_B,
    facilityId: FACILITY_B,
    db: world,
  });
  assert.equal(decision.canManage, false);
  assert.match(String(decision.reason), /Partner/);
});

test("PIN FA does not gain Dietary assignment management", async () => {
  const decision = await resolveAssignmentAuthority({
    session: session({
      uid: "employee_pin",
      authKind: "employee",
      authMethod: "QUICK_PIN",
      facilityId: FACILITY_B,
      role: "FACILITY_ADMINISTRATOR",
    }),
    departmentId: DIETARY_B,
    facilityId: FACILITY_B,
    db: world,
  });
  assert.equal(decision.canManage, false);
  assert.match(String(decision.reason), /Facility Administrator/);
});

test("assignment authority source does not use User home fields as current authority", () => {
  assert.equal(SOURCE.includes("user.findFirst"), false);
  assert.equal(SOURCE.includes("primaryDepartmentId"), false);
  assert.equal(SOURCE.includes("User.facilityId"), false);
  assert.equal(SOURCE.includes("User.roleId"), false);
  assert.equal(SOURCE.includes("user.facilityId"), false);
  assert.equal(SOURCE.includes("user.roleId"), false);
  assert.match(SOURCE, /hasDietaryDomainCapabilities/);
  assert.match(SOURCE, /session\.facilityId/);
  assert.match(SOURCE, /session\.role/);
});
