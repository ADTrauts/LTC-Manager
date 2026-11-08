import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LOCATION_FUNCTION_AUTHORING_RETIRED } from "@/lib/department-administration/profile-service";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("Phase 2A: Locations panel does not mount Location Function authoring", () => {
  const panel = source(
    "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
  );
  assert.doesNotMatch(
    panel,
    /Location Function|bindLocationFunctionAction|publishLocationFunctionsAction|createOperationalTypeAction/,
  );
  assert.match(panel, /Facility Builder/);
  assert.match(panel, /data-testid="department-locations-panel"/);
});

test("Phase 2A: Location Function server actions return the retired message", () => {
  const actions = source(
    "src/app/(protected)/admin/departments/[departmentId]/actions.ts",
  );
  for (const name of [
    "createOperationalTypeAction",
    "bindLocationFunctionAction",
    "publishLocationFunctionsAction",
    "ensurePatternDraftAction",
    "clearRoomOperationalTypeAction",
    "renameOperationalTypeAction",
    "updateRoomTypeDepartmentUseAction",
    "createArchetypeAction",
    "updateArchetypeAction",
    "clearRoomBindingAction",
    "ensureLocationOperationalTypesAction",
    "clearLocationOperationalTypeAction",
  ]) {
    assert.match(actions, new RegExp(`export async function ${name}`));
  }
  assert.match(actions, /LOCATION_FUNCTION_AUTHORING_RETIRED/);
  assert.doesNotMatch(
    actions,
    /adoptProductLocationFunction|bindLocationFunction\(|publishLocationFunctionDraft|createRoomArchetype|updateRoomArchetype|clearRoomArchetypeBinding/,
  );
  assert.match(LOCATION_FUNCTION_AUTHORING_RETIRED, /Facility Builder/);
});

test("Phase 2A: profile-service Location Function writers throw retired", () => {
  const service = source("src/lib/department-administration/profile-service.ts");
  for (const name of [
    "adoptProductLocationFunction",
    "bindLocationFunction",
    "clearLocationFunction",
    "publishLocationFunctionDraft",
    "createRoomArchetype",
    "updateRoomArchetype",
    "bindRoomToArchetype",
    "clearRoomArchetypeBinding",
  ]) {
    const start = service.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, name);
    const slice = service.slice(start, start + 500);
    assert.match(slice, /LOCATION_FUNCTION_AUTHORING_RETIRED/);
  }
});
