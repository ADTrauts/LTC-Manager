import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveDefaultRoleKeyForDepartmentJobRole,
  deriveRoleLabelSnapshot,
} from "./department-job-role-derivation";

describe("Department Job Role -> operational role derivation", () => {
  it("maps active SUPERVISOR tier to department supervisor rounding roleKey", () => {
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "DIETARY", tier: "SUPERVISOR" }),
      "DIETARY_SUPERVISOR_ROUNDING",
    );
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "EVS", tier: "SUPERVISOR" }),
      "EVS_SUPERVISOR_ROUNDING",
    );
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "PLANT", tier: "SUPERVISOR" }),
      "PLANT_SUPERVISOR_ROUNDING",
    );
  });

  it("maps LEAD and TEAM_MEMBER tiers to department-appropriate operational roles", () => {
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "DIETARY", tier: "LEAD" }),
      "CALL_DOWN_RUNNER",
    );
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "DIETARY", tier: "TEAM_MEMBER" }),
      "SERVER",
    );

    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "EVS", tier: "LEAD" }),
      "FLOOR_CARE",
    );
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "EVS", tier: "TEAM_MEMBER" }),
      "CLEANING_ROUND",
    );

    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "PLANT", tier: "LEAD" }),
      "EQUIPMENT_ROUND",
    );
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "PLANT", tier: "TEAM_MEMBER" }),
      "WORK_ORDER_RESPONSE",
    );
  });

  it("legacy / missing job role tier falls back to first role for department", () => {
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "DIETARY", tier: null }),
      "COOK",
    );
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "EVS", tier: null }),
      "CLEANING_ROUND",
    );
    assert.equal(
      deriveDefaultRoleKeyForDepartmentJobRole({ departmentKey: "PLANT", tier: null }),
      "WORK_ORDER_RESPONSE",
    );
  });

  it("derives historical roleLabel snapshot from jobRole displayName with fallback", () => {
    assert.equal(
      deriveRoleLabelSnapshot({
        jobRoleDisplayName: "Resident Services Supervisor",
        roleDefLabel: "Supervisor Rounding",
      }),
      "Resident Services Supervisor",
    );

    assert.equal(
      deriveRoleLabelSnapshot({
        jobRoleDisplayName: null,
        roleDefLabel: "Supervisor Rounding",
      }),
      "Supervisor Rounding",
    );
  });
});

