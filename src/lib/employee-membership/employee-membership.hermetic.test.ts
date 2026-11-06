import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  employeeBelongsToDepartment,
  evaluateTeamMembershipSubmission,
  normalizeDepartmentMembership,
  parseEmployeeOrganizationForm,
  resolveDepartmentMembershipIds,
} from "./index";

describe("Department membership resolver", () => {
  it("unions primary Department with additional EmployeeDepartment rows and de-dupes", () => {
    assert.deepEqual(
      resolveDepartmentMembershipIds({
        primaryDepartmentId: "dietary",
        employeeDepartments: [{ departmentId: "evs" }, { departmentId: "dietary" }],
      }).sort(),
      ["dietary", "evs"],
    );
    assert.equal(
      employeeBelongsToDepartment(
        { primaryDepartmentId: "dietary", employeeDepartments: [{ departmentId: "evs" }] },
        "evs",
      ),
      true,
    );
    assert.equal(
      employeeBelongsToDepartment({ primaryDepartmentId: "dietary", employeeDepartments: [] }, "evs"),
      false,
    );
  });

  it("does not store an additional row for the primary Department", () => {
    const normalized = normalizeDepartmentMembership({
      primaryDepartmentId: "dietary",
      additionalDepartmentIds: ["dietary", "evs", "evs", ""],
    });
    assert.equal(normalized.primaryDepartmentId, "dietary");
    assert.deepEqual(normalized.additionalDepartmentIds, ["evs"]);
  });
});

describe("Team membership validation", () => {
  const dietaryTeams = new Map([
    [
      "resident",
      { id: "resident", facilityId: "f1", departmentId: "dietary", status: "ACTIVE" as const },
    ],
    [
      "retail",
      { id: "retail", facilityId: "f1", departmentId: "dietary", status: "ACTIVE" as const },
    ],
    [
      "public",
      { id: "public", facilityId: "f1", departmentId: "evs", status: "ACTIVE" as const },
    ],
    [
      "archived",
      { id: "archived", facilityId: "f1", departmentId: "dietary", status: "ARCHIVED" as const },
    ],
  ]);

  it("accepts primary + additional Teams in one Department", () => {
    const result = evaluateTeamMembershipSubmission({
      facilityId: "f1",
      departmentIds: new Set(["dietary"]),
      teamsById: dietaryTeams,
      memberships: [
        { teamId: "resident", isPrimary: true },
        { teamId: "retail", isPrimary: false },
      ],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.rows.find((row) => row.teamId === "resident")?.isPrimary, true);
      assert.equal(result.rows.find((row) => row.teamId === "retail")?.isPrimary, false);
    }
  });

  it("accepts one Primary Team per Department across Departments", () => {
    const result = evaluateTeamMembershipSubmission({
      facilityId: "f1",
      departmentIds: new Set(["dietary", "evs"]),
      teamsById: dietaryTeams,
      memberships: [
        { teamId: "resident", isPrimary: true },
        { teamId: "public", isPrimary: true },
      ],
    });
    assert.equal(result.ok, true);
  });

  it("rejects two Primary Teams in the same Department", () => {
    const result = evaluateTeamMembershipSubmission({
      facilityId: "f1",
      departmentIds: new Set(["dietary"]),
      teamsById: dietaryTeams,
      memberships: [
        { teamId: "resident", isPrimary: true },
        { teamId: "retail", isPrimary: true },
      ],
    });
    assert.equal(result.ok, false);
  });

  it("rejects Team membership without Department membership", () => {
    const result = evaluateTeamMembershipSubmission({
      facilityId: "f1",
      departmentIds: new Set(["dietary"]),
      teamsById: dietaryTeams,
      memberships: [{ teamId: "public", isPrimary: true }],
    });
    assert.equal(result.ok, false);
  });

  it("allows Department membership with no Teams", () => {
    const result = evaluateTeamMembershipSubmission({
      facilityId: "f1",
      departmentIds: new Set(["dietary"]),
      teamsById: dietaryTeams,
      memberships: [],
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.rows.length, 0);
  });

  it("rejects archived Team assignment from the active selector", () => {
    const result = evaluateTeamMembershipSubmission({
      facilityId: "f1",
      departmentIds: new Set(["dietary"]),
      teamsById: dietaryTeams,
      memberships: [{ teamId: "archived", isPrimary: true }],
    });
    assert.equal(result.ok, false);
  });
});

describe("Organization form parsing", () => {
  it("treats primary Team as membership and does not require a duplicate additional row", () => {
    const form = new FormData();
    form.set("primaryDepartmentId", "dietary");
    form.append("additionalDepartmentIds", "evs");
    form.set("primaryTeam:dietary", "resident");
    form.append("additionalTeamIds", "retail");
    form.set("jobTitleId", "supervisor-title");
    form.set("jobRole:dietary", "role-member");
    form.set("jobRole:evs", "role-lead");
    const parsed = parseEmployeeOrganizationForm(form);
    assert.equal(parsed.primaryDepartmentId, "dietary");
    assert.deepEqual(parsed.additionalDepartmentIds, ["evs"]);
    assert.equal(parsed.jobTitleId, "supervisor-title");
    const byId = new Map(parsed.teamMemberships.map((row) => [row.teamId, row.isPrimary]));
    assert.equal(byId.get("resident"), true);
    assert.equal(byId.get("retail"), false);
    assert.equal(parsed.jobRoleByDepartmentId.get("dietary"), "role-member");
    assert.equal(parsed.jobRoleByDepartmentId.get("evs"), "role-lead");
  });
});

describe("Employee Builder contracts", () => {
  it("keeps Job Role and Platform authority separate from Team; Job Title is not shown on the org form", () => {
    const fields = readFileSync(
      join(process.cwd(), "src/components/employee-organization-fields.tsx"),
      "utf8",
    );
    const card = readFileSync(
      join(process.cwd(), "src/components/employee-management-card.tsx"),
      "utf8",
    );
    const create = readFileSync(
      join(process.cwd(), "src/components/create-employee-drawer.tsx"),
      "utf8",
    );
    const filters = readFileSync(
      join(process.cwd(), "src/components/employees-filters.tsx"),
      "utf8",
    );
    assert.match(fields, /Job Role/);
    assert.match(fields, /\+ Add department/);
    assert.match(fields, /\+ Add team/);
    assert.equal(/Job Title/.test(fields), false);
    assert.equal(/Job Title/.test(card), false);
    assert.equal(/name="jobTitleId"/.test(create) && /Job Title/.test(create), false);
    assert.equal(/Job Title/.test(filters), false);
    assert.match(card, /Platform authority/);
    assert.match(card, /Department work permissions come from Job Roles/);
    assert.equal(/WorkStation/.test(fields), false);
  });

  it("normal employee profile exposes Profile + Access without CHRC, Discipline, or Assignments tabs", () => {
    const card = readFileSync(
      join(process.cwd(), "src/components/employee-management-card.tsx"),
      "utf8",
    );
    assert.match(card, /employee-profile-section/);
    assert.match(card, /employee-access-section/);
    assert.match(card, /PIN sign-in/);
    assert.match(card, /PIN configured/);
    assert.match(card, /No PIN configured/);
    assert.match(card, /Set PIN/);
    assert.match(card, /Reset PIN/);
    assert.equal(/Floor PIN/.test(card), false);
    assert.equal(/EmployeeChrcFormSection/.test(card), false);
    assert.equal(/EmployeeDisciplineSection/.test(card), false);
    assert.equal(/setDefaultAssignmentAction/.test(card), false);
    assert.equal(/EmployeeHrUnionFormSection/.test(card), false);
    assert.equal(/TAB_LABEL/.test(card), false);
  });

  it("primary Employee Builder nav is Employees | Job Roles without Points/CHRC/HR Audit", () => {
    const subNav = readFileSync(join(process.cwd(), "src/components/employees-sub-nav.tsx"), "utf8");
    assert.match(subNav, /Employees/);
    assert.match(subNav, /Job Roles/);
    assert.equal(/points-summary/.test(subNav), false);
    assert.equal(/chrc-report/.test(subNav), false);
    assert.equal(/hr-audit/.test(subNav), false);
    assert.equal(/separations/.test(subNav), false);
  });

  it("Employee Builder layout no longer mounts a local Department tab strip", () => {
    const layout = readFileSync(
      join(process.cwd(), "src/app/(protected)/employees/layout.tsx"),
      "utf8",
    );
    assert.equal(/EmployeesDepartmentTabs/.test(layout), false);
  });

  it("normal Employee editor no longer mounts Unit Access fields", () => {
    const card = readFileSync(
      join(process.cwd(), "src/components/employee-management-card.tsx"),
      "utf8",
    );
    const create = readFileSync(
      join(process.cwd(), "src/components/create-employee-drawer.tsx"),
      "utf8",
    );
    assert.equal(/EmployeeUnitAccessFields/.test(card), false);
    assert.equal(/EmployeeUnitAccessFields/.test(create), false);
  });

  it("Today's Work operating-location loader applies viewer Team scope", () => {
    const load = readFileSync(
      join(process.cwd(), "src/lib/todays-work/operating-locations/load.ts"),
      "utf8",
    );
    const build = readFileSync(
      join(process.cwd(), "src/lib/todays-work/operating-locations/build.ts"),
      "utf8",
    );
    assert.match(load, /resolveViewerTeamScopes/);
    assert.equal(/employeeTeamMembership|DepartmentTeam/.test(build), false);
  });

  it("leaves EmployeeDepartment.roleType dormant in organization writes", () => {
    const department = readFileSync(
      join(process.cwd(), "src/lib/employee-membership/department.ts"),
      "utf8",
    );
    assert.equal(/roleType:/.test(department), false);
  });

  it("PIN set action requires confirmation and limits eligibility through credential policy", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/app/(protected)/employees/actions.ts"),
      "utf8",
    );
    const policy = readFileSync(join(process.cwd(), "src/lib/credential-policy.ts"), "utf8");
    assert.match(actions, /confirmPin/);
    assert.match(actions, /Only active employees can set or reset a PIN/);
    assert.match(policy, /RoleKey\.LEAD_TEAM_MEMBER/);
    assert.match(policy, /RoleKey\.STAFF/);
    assert.doesNotMatch(policy, /QUICK_PIN_ELIGIBLE_ROLES: readonly RoleKey\[] = Object\.values\(RoleKey\)/);
  });
});
