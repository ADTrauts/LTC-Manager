import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("the assignment board cannot author a Coverage requirement", () => {
  const actions = source("src/app/(protected)/staffing/assignments/template-actions.ts");
  for (const name of [
    "createTemplateAction",
    "editTemplateAction",
    "addTemplateItemAction",
    "removeTemplateItemAction",
    "moveTemplateItemAction",
  ]) {
    const start = actions.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, name);
    const next = actions.indexOf("export async function", start + 20);
    const body = actions.slice(start, next === -1 ? undefined : next);
    assert.match(body, /rejectCoverageAuthoring/);
    assert.doesNotMatch(body, /prisma\./);
    assert.doesNotMatch(body, /applyAssignmentTemplate/);
  }

  const apply = actions.slice(actions.indexOf("export async function applyTemplateAction"));
  const gate = apply.indexOf("isCoverageTemplateEffectiveOnDate");
  const write = apply.indexOf("applyAssignmentTemplate(");
  assert.ok(gate > 0);
  assert.ok(write > gate);

  const page = source("src/app/(protected)/staffing/assignments/page.tsx");
  assert.match(page, /applyTemplateAction/);
  assert.doesNotMatch(page, /createTemplateAction|editTemplateAction|addTemplateItemAction|removeTemplateItemAction|moveTemplateItemAction/);

  const preview = source(
    "src/lib/scheduling/operational-assignments/load-assignment-template-preview.ts",
  );
  const previewGate = preview.indexOf("isCoverageTemplateEffectiveOnDate");
  const emptyPositions = preview.indexOf("positions: []");
  assert.ok(previewGate > 0);
  assert.ok(emptyPositions > previewGate);
});

test("Today reuses the canonical evaluator and does not treat a schedule as fill", () => {
  const today = source("src/lib/department-administration/today-coverage.ts");
  assert.match(today, /buildDietaryCoverageSummary/);
  assert.match(today, /scheduledEmployeeIds: \[\]/);
  assert.match(today, /getFacilityServiceDate/);
  assert.doesNotMatch(today, /evaluateCoverageSlots/);
});

test("the Department workforce summary stays on membership and qualifications", () => {
  const organization = source("src/lib/department-administration/people-organization.ts");
  assert.match(organization, /employeeBelongsToDepartmentWhere/);
  assert.match(organization, /operationalRoleQualifications/);
  assert.match(organization, /departmentId: input\.departmentId, status: "ACTIVE"/);
  assert.doesNotMatch(organization, /operationalAssignment|scheduleEntry|RoleKey/);
});

test("Employee Builder keeps the requested Department on the directory", () => {
  const page = source("src/app/(protected)/employees/page.tsx");
  assert.match(page, /resolveDirectoryDepartmentId/);
  assert.match(page, /DepartmentTeamsSection/);
  const workspace = source(
    "src/app/(protected)/admin/departments/[departmentId]/teams-workspace.tsx",
  );
  assert.doesNotMatch(workspace, /createDepartmentTeamAction|archiveDepartmentTeamAction/);
  assert.match(workspace, /Manage teams in Employee Builder/);
});

test("partner Coverage may create a Team for a vendor-run Department and does not author Coverage requirements", () => {
  const actions = source("src/app/partner/coverage/actions.ts");
  assert.match(actions, /createPartnerTeamAction/);
  assert.match(actions, /partnerMaySetUpDepartment/);
  assert.match(actions, /prisma\.departmentTeam\.create/);
  assert.doesNotMatch(actions, /OperationalAssignmentTemplate|ensureWorkingCoverageDraft|publishCoverageExpectation/);
  assert.doesNotMatch(actions, /createDepartmentTeam\(/);
});
