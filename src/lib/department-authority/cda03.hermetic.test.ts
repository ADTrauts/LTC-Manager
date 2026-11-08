import assert from "node:assert/strict";
import test from "node:test";

import { EmployeeStatus, RoleKey } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import { decideAssetOperationsAuthority } from "@/lib/asset-operations/authority";
import { decideWorkAuthority } from "@/lib/department-work/authority";
import { decideJobFlowAuthority } from "@/lib/dietary-job-flow/job-flow-authority";
import { decideEvidenceAuthority } from "@/lib/operational-evidence/evidence-authority";
import { decideOperationalRequestAuthority } from "@/lib/operational-requests/authority";
import { decidePmPlanAuthority } from "@/lib/preventive-maintenance/authority";

import { DEPARTMENT_VIEW_REASON } from "./access";
import { deriveDepartmentHeadStatus } from "./heads";
import { isStaffManagerEligible } from "./staff-managers";

const base = {
  flagEnabled: true,
  authMethod: "PASSWORD" as const,
  sessionFacilityId: "facility",
  facilityId: "facility",
  departmentId: "plant",
  departmentExists: true,
  departmentKey: "PLANT",
};

type Decision = Record<string, boolean | string | null>;

const MODULES: Array<{
  name: string;
  decide: (input: typeof base & { role: AppRole; primaryDepartmentId: string | null; facilityAdministratorView?: boolean }) => Decision;
  view: string[];
  deniedView: string[];
}> = [
  { name: "Work", decide: decideWorkAuthority, view: ["canViewRuntime", "canViewDepartment"], deniedView: [] },
  {
    name: "Records",
    decide: decideEvidenceAuthority,
    view: ["canViewOwn", "canViewDepartment", "canViewLogBook"],
    deniedView: [],
  },
  { name: "Preventive maintenance", decide: decidePmPlanAuthority, view: ["canView"], deniedView: [] },
  {
    name: "Plant requests",
    decide: decideOperationalRequestAuthority,
    view: ["canViewRequesterStatus", "canViewInternalNotes"],
    deniedView: [],
  },
  {
    name: "Job Flow",
    decide: decideJobFlowAuthority,
    view: ["canViewOwnJobFlow", "canViewSupervisorBoard"],
    deniedView: [],
  },
  {
    name: "Assets",
    decide: decideAssetOperationsAuthority,
    view: ["canViewRuntime", "canViewManagementNotes", "canViewVendorDetails"],
    deniedView: ["canViewRuntime"],
  },
];

for (const authority of MODULES) {
  test(`CDA-03 view fix: ${authority.name} gives the Facility Administrator view fields only`, () => {
    const decision = authority.decide({
      ...base,
      role: "FACILITY_ADMINISTRATOR",
      primaryDepartmentId: "evs",
      facilityAdministratorView: true,
    });
    for (const [field, value] of Object.entries(decision)) {
      if (field === "reason") continue;
      assert.equal(value, authority.view.includes(field), `${authority.name}.${field}`);
    }
    assert.equal(decision.reason, DEPARTMENT_VIEW_REASON);
  });

  test(`CDA-03 view fix: ${authority.name} keeps today's denial without the view`, () => {
    const decision = authority.decide({ ...base, role: "FACILITY_ADMINISTRATOR", primaryDepartmentId: "evs" });
    for (const [field, value] of Object.entries(decision)) {
      if (field === "reason") continue;
      assert.equal(value, authority.deniedView.includes(field), `${authority.name}.${field}`);
    }
    assert.match(String(decision.reason), /Facility Administrator status alone/);
  });

  test(`CDA-03 view fix: ${authority.name} is unchanged for a primary member and for other roles`, () => {
    for (const input of [
      { role: "FACILITY_ADMINISTRATOR" as const, primaryDepartmentId: "plant" },
      { role: "MANAGER" as const, primaryDepartmentId: "evs" },
    ]) {
      assert.deepEqual(
        authority.decide({ ...base, ...input, facilityAdministratorView: true }),
        authority.decide({ ...base, ...input }),
      );
    }
  });
}

test("CDA-03 view fix: the module flag still comes first", () => {
  const decision = decideWorkAuthority({
    ...base,
    flagEnabled: false,
    role: "FACILITY_ADMINISTRATOR",
    primaryDepartmentId: "evs",
    facilityAdministratorView: true,
  });
  assert.equal(decision.canViewDepartment, false);
  assert.equal(decision.reason, "Department Work Plans are not enabled.");
});

const member = (overrides: Partial<{ status: EmployeeStatus; primaryDepartmentId: string | null; additional: string[] }> = {}) => ({
  status: overrides.status ?? EmployeeStatus.ACTIVE,
  primaryDepartmentId: overrides.primaryDepartmentId === undefined ? "evs" : overrides.primaryDepartmentId,
  employeeDepartments: (overrides.additional ?? []).map((departmentId) => ({ departmentId })),
});

test("CDA-03 heads: a Department is headed by an active member head or an active primary GM", () => {
  const status = (recordedHead: ReturnType<typeof member> | null, hasActivePrimaryGm = false) =>
    deriveDepartmentHeadStatus({ departmentId: "evs", recordedHead, hasActivePrimaryGm });

  assert.equal(status(member()), "HEADED");
  assert.equal(status(member({ primaryDepartmentId: "plant", additional: ["evs"] })), "HEADED");
  assert.equal(status(null), "NO_HEAD");
  assert.equal(status(null, true), "HEADED");
  assert.equal(status(member({ status: EmployeeStatus.TERMINATED })), "HEAD_LEFT");
  assert.equal(status(member({ primaryDepartmentId: "plant" })), "HEAD_LEFT");
  assert.equal(status(member({ status: EmployeeStatus.OFF })), "HEADED");
  assert.equal(status(member({ status: EmployeeStatus.TERMINATED }), true), "HEADED");
});

test("CDA-03 head-allowed managers: only an active Manager member other than the head", () => {
  const eligible = (
    overrides: Partial<{ id: string; roleType: RoleKey; status: EmployeeStatus; primaryDepartmentId: string | null }> = {},
  ) =>
    isStaffManagerEligible({
      departmentId: "evs",
      headEmployeeId: "head",
      employee: {
        id: overrides.id ?? "manager",
        roleType: overrides.roleType ?? RoleKey.MANAGER,
        ...member({ status: overrides.status, primaryDepartmentId: overrides.primaryDepartmentId }),
      },
    });

  assert.equal(eligible(), true);
  assert.equal(eligible({ id: "head" }), false);
  assert.equal(eligible({ roleType: RoleKey.SUPERVISOR }), false);
  assert.equal(eligible({ roleType: RoleKey.GM }), false);
  assert.equal(eligible({ status: EmployeeStatus.TERMINATED }), false);
  assert.equal(eligible({ primaryDepartmentId: "plant" }), false);
});
