/**
 * Phase 6H routing / performance contract.
 * /workspace loads one RLS batch. Place chain and Job Flow stay untouched.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { loadBusinessWorkspace } from "@/lib/business-workspace/load-business-workspace";

const pageSrc = readFileSync(
  join(process.cwd(), "src/app/(protected)/workspace/page.tsx"),
  "utf8",
);
const loadSrc = readFileSync(
  join(process.cwd(), "src/lib/business-workspace/dashboard/load.ts"),
  "utf8",
);
const composeSrc = readFileSync(
  join(process.cwd(), "src/lib/business-workspace/load-business-workspace.ts"),
  "utf8",
);

test("existing Dashboard route is retained", () => {
  assert.match(pageSrc, /loadDashboardRuntime/);
  assert.match(pageSrc, /<BusinessWorkspaceScreen/);
  assert.equal(pageSrc.includes("/operations\""), false);
});

test("Dashboard operational truth is one RLS batch of projected spaces", () => {
  assert.match(loadSrc, /collectActionableLandingSpaces/);
  assert.match(loadSrc, /loadRuntimeLocationStates\(/);
  assert.equal((loadSrc.match(/loadRuntimeLocationStates\(/g) ?? []).length, 1);
  assert.equal(loadSrc.includes("loadDashboardQueries"), false);
  assert.equal(loadSrc.includes("computeReadinessBatch"), false);
  assert.equal(loadSrc.includes("ScheduleEntry"), false);
  assert.equal(loadSrc.includes("LogAssignment"), false);
});

test("runtime compose path requires dashboardRuntime and has no leftover fallback", () => {
  assert.match(composeSrc, /dashboardRuntime/);
  assert.match(composeSrc, /loadWorkspaceNonOperationalExtras/);
  assert.match(composeSrc, /Business Workspace requires canonical dashboardRuntime/);
  assert.equal(composeSrc.includes("loadBusinessWorkspaceInputs"), false);
  assert.equal(composeSrc.includes("loadDashboardQueries"), false);
  assert.equal(composeSrc.includes("computeReadinessBatch"), false);
  assert.equal(existsSync(join(process.cwd(), "src/lib/business-workspace/load-workspace-inputs.ts")), false);
});

test("Business Workspace fails closed without dashboardRuntime", async () => {
  await assert.rejects(
    () =>
      loadBusinessWorkspace({
        facilityId: "fac-1",
        facilityName: "Test",
        userDisplayName: "Ada Manager",
        role: "MANAGER",
      }),
    /requires canonical dashboardRuntime/,
  );
});
