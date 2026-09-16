import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure evaluation of Job Role assignment rules used by the write path.
 * Mirrors syncEmployeeDepartmentJobRoles validation without DB.
 */
function evaluateJobRoleAssignment(input: {
  employeeDepartmentIds: ReadonlySet<string>;
  role: {
    id: string;
    facilityId: string;
    departmentId: string;
    status: "ACTIVE" | "ARCHIVED";
  } | null;
  targetFacilityId: string;
  targetDepartmentId: string;
  existingAssignedRoleId?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.employeeDepartmentIds.has(input.targetDepartmentId)) {
    return { ok: false, reason: "Job Role assignment requires Department membership." };
  }
  if (!input.role) {
    return { ok: false, reason: "Job Role not found." };
  }
  if (input.role.facilityId !== input.targetFacilityId) {
    return { ok: false, reason: "Cross-facility Job Role assignment rejected." };
  }
  if (input.role.departmentId !== input.targetDepartmentId) {
    return { ok: false, reason: "Job Role must belong to the selected Department." };
  }
  if (
    input.role.status !== "ACTIVE" &&
    input.existingAssignedRoleId !== input.role.id
  ) {
    return { ok: false, reason: "Archived Job Roles cannot be newly assigned." };
  }
  return { ok: true };
}

describe("Job Role assignment rules", () => {
  const dietaryRole = {
    id: "role-dietary-member",
    facilityId: "f1",
    departmentId: "dietary",
    status: "ACTIVE" as const,
  };
  const evsRole = {
    id: "role-evs-lead",
    facilityId: "f1",
    departmentId: "evs",
    status: "ACTIVE" as const,
  };
  const otherFacilityRole = {
    id: "role-other",
    facilityId: "f2",
    departmentId: "dietary",
    status: "ACTIVE" as const,
  };
  const archived = {
    id: "role-archived",
    facilityId: "f1",
    departmentId: "dietary",
    status: "ARCHIVED" as const,
  };

  it("rejects assigning a Dietary role onto EVS-only membership", () => {
    const result = evaluateJobRoleAssignment({
      employeeDepartmentIds: new Set(["evs"]),
      role: dietaryRole,
      targetFacilityId: "f1",
      targetDepartmentId: "evs",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /belong to the selected Department/);
  });

  it("rejects assignment without Department membership", () => {
    const result = evaluateJobRoleAssignment({
      employeeDepartmentIds: new Set(["dietary"]),
      role: dietaryRole,
      targetFacilityId: "f1",
      targetDepartmentId: "evs",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /Department membership/);
  });

  it("rejects cross-facility role assignment", () => {
    const result = evaluateJobRoleAssignment({
      employeeDepartmentIds: new Set(["dietary"]),
      role: otherFacilityRole,
      targetFacilityId: "f1",
      targetDepartmentId: "dietary",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /Cross-facility/);
  });

  it("allows different roles across two Departments for one employee", () => {
    assert.equal(
      evaluateJobRoleAssignment({
        employeeDepartmentIds: new Set(["dietary", "evs"]),
        role: dietaryRole,
        targetFacilityId: "f1",
        targetDepartmentId: "dietary",
      }).ok,
      true,
    );
    assert.equal(
      evaluateJobRoleAssignment({
        employeeDepartmentIds: new Set(["dietary", "evs"]),
        role: evsRole,
        targetFacilityId: "f1",
        targetDepartmentId: "evs",
      }).ok,
      true,
    );
  });

  it("blocks new assignment of archived roles while preserving existing historical reference", () => {
    const fresh = evaluateJobRoleAssignment({
      employeeDepartmentIds: new Set(["dietary"]),
      role: archived,
      targetFacilityId: "f1",
      targetDepartmentId: "dietary",
    });
    assert.equal(fresh.ok, false);

    const keepExisting = evaluateJobRoleAssignment({
      employeeDepartmentIds: new Set(["dietary"]),
      role: archived,
      targetFacilityId: "f1",
      targetDepartmentId: "dietary",
      existingAssignedRoleId: archived.id,
    });
    assert.equal(keepExisting.ok, true);
  });
});
