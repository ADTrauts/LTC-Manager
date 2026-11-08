import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decideJobRoleAuthority,
  defaultCapabilitiesForTier,
  isOperationalCapabilityKey,
  jobRoleNamesConflict,
  normalizeCapabilityKeys,
  normalizeJobRoleDisplayName,
  OPERATIONAL_CAPABILITY_KEYS,
  parseJobRoleTier,
  STARTER_JOB_ROLE_DEFINITIONS,
} from "./index";

describe("Department Job Role foundation", () => {
  it("keeps generic tier independent from display name", () => {
    assert.equal(parseJobRoleTier("SUPERVISOR"), "SUPERVISOR");
    assert.equal(normalizeJobRoleDisplayName("  Resident Services Supervisor  "), "Resident Services Supervisor");
    assert.doesNotThrow(() => parseJobRoleTier("MANAGER"));
    assert.throws(() => parseJobRoleTier("GM"), /valid Job Role tier/);
    assert.throws(() => parseJobRoleTier("FACILITY_ADMINISTRATOR"), /valid Job Role tier/);
  });

  it("treats starter names as editable labels, not auth keys", () => {
    assert.equal(STARTER_JOB_ROLE_DEFINITIONS.length, 4);
    assert.ok(STARTER_JOB_ROLE_DEFINITIONS.every((role) => role.displayName && role.tier));
    assert.equal(jobRoleNamesConflict("Team Lead", "team lead"), true);
    assert.equal(jobRoleNamesConflict("Lead", "Supervisor"), false);
  });

  it("does not conflate Job Title concepts with Job Role tiers", () => {
    // Job Titles remain facility HR labels; tiers are only TEAM_MEMBER|LEAD|SUPERVISOR|MANAGER.
    assert.deepEqual(
      STARTER_JOB_ROLE_DEFINITIONS.map((r) => r.tier),
      ["TEAM_MEMBER", "LEAD", "SUPERVISOR", "MANAGER"],
    );
  });

  it("provides explicit capability defaults per tier without deriving forever from rename", () => {
    const member = defaultCapabilitiesForTier("TEAM_MEMBER");
    const lead = defaultCapabilitiesForTier("LEAD");
    const supervisor = defaultCapabilitiesForTier("SUPERVISOR");
    const manager = defaultCapabilitiesForTier("MANAGER");

    assert.ok(member.includes("COMPLETE_ASSIGNED_WORK"));
    assert.ok(!member.includes("MANAGE_EMPLOYEES"));
    assert.ok(lead.includes("MANAGE_TEAM_OPERATION"));
    assert.ok(supervisor.includes("ASSIGN_DAILY_COVERAGE"));
    assert.ok(manager.includes("CONFIGURE_DEPARTMENT"));
    assert.ok(manager.includes("MANAGE_EMPLOYEES"));

    // Display-name change is orthogonal — defaults are keyed by tier only.
    assert.deepEqual(defaultCapabilitiesForTier("SUPERVISOR"), supervisor);
  });

  it("validates capability keys and rejects unknown keys", () => {
    assert.equal(isOperationalCapabilityKey("VIEW_STAFFING"), true);
    assert.equal(isOperationalCapabilityKey("/today/coverage"), false);
    assert.deepEqual(normalizeCapabilityKeys(["VIEW_STAFFING", "VIEW_STAFFING", "REPORT_ISSUES"]), [
      "VIEW_STAFFING",
      "REPORT_ISSUES",
    ]);
    assert.throws(() => normalizeCapabilityKeys(["NOT_A_REAL_CAPABILITY"]), /Unknown capability/);
    assert.ok(OPERATIONAL_CAPABILITY_KEYS.length >= 8);
    assert.ok(OPERATIONAL_CAPABILITY_KEYS.length <= 15);
  });

  it("blocks Quick PIN from Job Role Build writes", () => {
    const pin = decideJobRoleAuthority({
      role: "MANAGER",
      authMethod: "QUICK_PIN",
      sessionFacilityId: "f1",
      facilityId: "f1",
      departmentExists: true,
    });
    assert.equal(pin.canView, true);
    assert.equal(pin.canManage, false);

    const password = decideJobRoleAuthority({
      role: "MANAGER",
      authMethod: "PASSWORD",
      sessionFacilityId: "f1",
      facilityId: "f1",
      departmentExists: true,
    });
    assert.equal(password.canManage, true);

    const crossFacility = decideJobRoleAuthority({
      role: "MANAGER",
      authMethod: "PASSWORD",
      sessionFacilityId: "f1",
      facilityId: "f2",
      departmentExists: true,
    });
    assert.equal(crossFacility.canManage, false);
  });

  it("requires a Department before creating roles (All Departments guard)", () => {
    const missingDept = decideJobRoleAuthority({
      role: "MANAGER",
      authMethod: "PASSWORD",
      sessionFacilityId: "f1",
      facilityId: "f1",
      departmentExists: false,
    });
    assert.equal(missingDept.canManage, false);
    assert.match(missingDept.reason ?? "", /Department not found/);
  });
});
