import assert from "node:assert/strict";
import test from "node:test";

import { isHarborWorkPathAllowed } from "@/lib/harbor-console/work-paths";

test("work session allows Facility Builder, Department Builder, Employees, Assets, and attach logs", () => {
  for (const path of [
    "/admin/facility/builder",
    "/admin/departments",
    "/admin/departments/cldept0001",
    "/employees",
    "/employees/import",
    "/assets",
    "/assets/builder",
    "/build/logs",
    "/build/logs/catalog/temperature",
    "/api/attachments/att_1",
    "/api/auth/session",
    "/api/auth/active-department",
  ]) {
    assert.equal(isHarborWorkPathAllowed(path), true, path);
  }
});

test("work session denies billing, setup, PIN/device bind, Catalog hub, and RUN home", () => {
  for (const path of [
    "/admin/billing",
    "/api/billing/setup-intent",
    "/setup",
    "/api/onboarding/state",
    "/api/auth/bind-device",
    "/api/auth/logout-full",
    "/api/auth/switch-facility",
    "/account",
    "/build",
    "/workspace",
    "/admin",
  ]) {
    assert.equal(isHarborWorkPathAllowed(path), false, path);
  }
});
