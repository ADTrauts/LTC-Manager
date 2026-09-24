import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { decideTeamAuthority, requireTeamManage } from "./authority";
import {
  evaluateTeamManagerCandidate,
  normalizeTeamDisplayName,
  teamNamesConflict,
  validateTeamRoomSubmission,
} from "./validation";

describe("Team authority", () => {
  const base = {
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentExists: true,
  } as const;

  it("allows Manager+ password sessions to manage", () => {
    for (const role of ["MANAGER", "GM", "FACILITY_ADMINISTRATOR"] as const) {
      const d = decideTeamAuthority({ ...base, role, authMethod: "PASSWORD" });
      assert.equal(d.canManage, true, role);
      assert.doesNotThrow(() => requireTeamManage(d));
    }
  });

  it("denies Quick PIN Build even for Manager", () => {
    const d = decideTeamAuthority({
      ...base,
      role: "MANAGER",
      authMethod: "QUICK_PIN",
    });
    assert.equal(d.canManage, false);
    assert.match(d.reason ?? "", /Quick PIN/i);
  });

  it("denies Supervisor and Staff", () => {
    for (const role of ["SUPERVISOR", "STAFF", "LEAD_TEAM_MEMBER"] as const) {
      const d = decideTeamAuthority({ ...base, role, authMethod: "PASSWORD" });
      assert.equal(d.canManage, false, role);
    }
  });

  it("denies cross-facility access", () => {
    const d = decideTeamAuthority({
      role: "MANAGER",
      authMethod: "PASSWORD",
      sessionFacilityId: "f1",
      facilityId: "f2",
      departmentExists: true,
    });
    assert.equal(d.canManage, false);
    assert.match(d.reason ?? "", /Cross-facility/i);
  });
});

describe("Team validation", () => {
  it("normalizes names and rejects blanks", () => {
    assert.equal(normalizeTeamDisplayName("  Resident Services  "), "Resident Services");
    assert.throws(() => normalizeTeamDisplayName("   "));
  });

  it("treats active names as case-insensitive duplicates", () => {
    assert.equal(teamNamesConflict("Resident Services", "resident services"), true);
    assert.equal(teamNamesConflict("Culinary", "Retail"), false);
  });

  it("accepts overlapping Room ids for different Teams and rejects unknown Rooms", () => {
    const allowed = new Set(["naval", "lighthouse"]);
    assert.deepEqual(
      validateTeamRoomSubmission({
        submittedSpaceIds: ["naval", "lighthouse"],
        allowedSpaceIds: allowed,
      }),
      ["naval", "lighthouse"],
    );
    assert.throws(() =>
      validateTeamRoomSubmission({
        submittedSpaceIds: ["naval", "evs-only"],
        allowedSpaceIds: allowed,
      }),
    );
  });

  it("does not persist Floor or Neighborhood ids as Rooms", () => {
    const allowed = new Set(["room-1"]);
    assert.throws(() =>
      validateTeamRoomSubmission({
        submittedSpaceIds: ["floor-1"],
        allowedSpaceIds: allowed,
      }),
    );
    assert.throws(() =>
      validateTeamRoomSubmission({
        submittedSpaceIds: ["neighborhood-1"],
        allowedSpaceIds: allowed,
      }),
    );
  });
});

describe("Team Manager eligibility", () => {
  it("allows known Department members, including additional membership", () => {
    const onRoster = evaluateTeamManagerCandidate(
      {
        id: "e1",
        facilityId: "f1",
        status: "ACTIVE",
        primaryDepartmentId: "dietary",
        membershipDepartmentIds: [],
      },
      { facilityId: "f1", departmentId: "dietary" },
    );
    assert.equal(onRoster.ok, true);

    const additional = evaluateTeamManagerCandidate(
      {
        id: "e1b",
        facilityId: "f1",
        status: "ACTIVE",
        primaryDepartmentId: "dietary",
        membershipDepartmentIds: ["evs"],
      },
      { facilityId: "f1", departmentId: "evs" },
    );
    assert.equal(additional.ok, true);
  });

  it("rejects employees with no Department membership", () => {
    const gap = evaluateTeamManagerCandidate(
      {
        id: "e2",
        facilityId: "f1",
        status: "ACTIVE",
        primaryDepartmentId: null,
        membershipDepartmentIds: [],
      },
      { facilityId: "f1", departmentId: "dietary" },
    );
    assert.equal(gap.ok, false);
  });

  it("rejects other-Department members, terminated employees, and other facilities", () => {
    const otherDept = evaluateTeamManagerCandidate(
      {
        id: "e3",
        facilityId: "f1",
        status: "ACTIVE",
        primaryDepartmentId: "evs",
        membershipDepartmentIds: [],
      },
      { facilityId: "f1", departmentId: "dietary" },
    );
    assert.equal(otherDept.ok, false);

    const terminated = evaluateTeamManagerCandidate(
      {
        id: "e4",
        facilityId: "f1",
        status: "TERMINATED",
        primaryDepartmentId: "dietary",
        membershipDepartmentIds: [],
      },
      { facilityId: "f1", departmentId: "dietary" },
    );
    assert.equal(terminated.ok, false);

    const otherFacility = evaluateTeamManagerCandidate(
      {
        id: "e5",
        facilityId: "f2",
        status: "ACTIVE",
        primaryDepartmentId: "dietary",
        membershipDepartmentIds: [],
      },
      { facilityId: "f1", departmentId: "dietary" },
    );
    assert.equal(otherFacility.ok, false);
  });
});

describe("Team product contracts", () => {
  it("Department Builder Teams UI stays generic and optional", () => {
    const workspace = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/teams-workspace.tsx"),
      "utf8",
    );
    assert.match(workspace, /Teams are optional/);
    assert.match(workspace, /Employee Builder/);
    assert.match(workspace, /Applies to Operational Types/);
    assert.match(workspace, /Specific Locations/);
    assert.match(workspace, /not today’s assignment/);
    assert.doesNotMatch(workspace, /Physical Room Type as/);
    assert.equal(/servery|kitchen|retail|culinary|dietary/i.test(workspace), false);
    assert.equal(/TeamType|CULINARY_TEAM/.test(workspace), false);
  });

  it("Employee Builder exposes optional Team membership grouped by Department", () => {
    const card = readFileSync(
      join(process.cwd(), "src/components/employee-management-card.tsx"),
      "utf8",
    );
    const fields = readFileSync(
      join(process.cwd(), "src/components/employee-organization-fields.tsx"),
      "utf8",
    );
    const actions = readFileSync(
      join(process.cwd(), "src/app/(protected)/employees/actions.ts"),
      "utf8",
    );
    assert.match(fields, /Primary Team/);
    assert.match(fields, /Additional Teams/);
    assert.match(fields, /No Teams configured/);
    assert.match(fields, /No Primary Team/);
    assert.match(actions, /syncEmployeeOrganization/);
    assert.equal(/servery|kitchen|culinary/i.test(fields), false);
    assert.match(card, /EmployeeOrganizationFields/);
  });

  it("Today's Work operating-location loader applies viewer Team scope", () => {
    const load = readFileSync(
      join(process.cwd(), "src/lib/todays-work/operating-locations/load.ts"),
      "utf8",
    );
    assert.match(load, /resolveViewerTeamScopes/);
    assert.match(load, /applyViewerTeamScopeToLocations/);
  });

  it("page mounts Teams as a primary Department Builder tab", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/page.tsx"),
      "utf8",
    );
    assert.match(page, /TeamsPanel/);
    assert.match(page, /tab === "teams"/);
  });
});
