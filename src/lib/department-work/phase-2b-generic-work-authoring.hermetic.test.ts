import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT,
  DEPARTMENT_ADMIN_TABS,
  resolveDepartmentAdminTab,
} from "@/lib/department-administration/admin-nav";
import { GENERIC_WORK_AUTHORING_RETIRED } from "@/lib/department-work";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("Phase 2B: Department Builder has no Work primary tab; old links land on Overview", () => {
  assert.equal(DEPARTMENT_ADMIN_TABS.some((tab) => tab.id === "work"), false);
  assert.equal(DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT.work, "overview");
  assert.equal(resolveDepartmentAdminTab("work"), "overview");
});

test("Phase 2B: Work Plan service writers throw the retired contract", () => {
  const service = source("src/lib/department-work/work-plan-service.ts");
  for (const name of [
    "createDraft",
    "updateDraft",
    "duplicateWorkPlan",
    "publishWorkPlan",
    "createSuccessorDraft",
    "retireWorkPlan",
    "createDraftFromPreset",
  ]) {
    const start = service.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, name);
    assert.match(service.slice(start, start + 400), /GENERIC_WORK_AUTHORING_RETIRED/);
  }
  assert.match(service, /loadPublishedWorkPlansForDate/);
  assert.match(GENERIC_WORK_AUTHORING_RETIRED, /Operating Rhythm/);
});

test("Phase 2B: staffing and partner Work actions are fenced", () => {
  const staffing = source("src/app/(protected)/staffing/work-plans/actions.ts");
  const partner = source("src/app/partner/work/actions.ts");
  assert.match(staffing, /GENERIC_WORK_AUTHORING_RETIRED/);
  assert.doesNotMatch(staffing, /createDraft\(|publishWorkPlan\(/);
  assert.match(partner, /GENERIC_WORK_AUTHORING_RETIRED/);
  assert.doesNotMatch(partner, /createDraft\(|publishWorkPlan\(/);
});

test("Phase 2B: Work builder and partner pages show retired surfaces", () => {
  const builder = source("src/app/(protected)/staffing/work-plans/page.tsx");
  const partner = source("src/app/partner/work/page.tsx");
  const departmentPage = source(
    "src/app/(protected)/admin/departments/[departmentId]/page.tsx",
  );
  assert.match(builder, /work-plan-builder-retired|GENERIC_WORK_AUTHORING_RETIRED/);
  assert.doesNotMatch(builder, /WorkPlanBuilderPanel/);
  assert.match(partner, /partner-work-page-retired|GENERIC_WORK_AUTHORING_RETIRED/);
  assert.doesNotMatch(partner, /PartnerWorkForms/);
  assert.doesNotMatch(departmentPage, /DepartmentWorkPanel/);
});

test("Phase 2B: Plant starter cannot create Work Plan drafts from presets", () => {
  const starter = source("src/lib/department-products/plant-starter.ts");
  assert.doesNotMatch(starter, /createDraftFromPreset|createWorkDraftFromPreset/);
});

test("Phase 2B: Build hub no longer encourages Work Plan authoring", () => {
  const hub = source("src/lib/build-hub.ts");
  assert.doesNotMatch(hub, /Author department work plans/);
  assert.match(hub, /Operating Rhythm, People & Coverage, and Records/);
});

test("Phase 2B: occurrence runtime writers remain (not plan authoring)", () => {
  const runtime = source("src/app/(protected)/staffing/work-plans/work-runtime-actions.ts");
  const occurrence = source("src/lib/department-work/occurrence-service.ts");
  assert.match(runtime, /createOneOffWorkAction|completeWorkRequirementAction/);
  assert.match(occurrence, /export async function completeExplicit/);
  assert.match(occurrence, /export async function createOneOff/);
});
