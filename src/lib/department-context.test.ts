import assert from "node:assert/strict";
import test from "node:test";

import { departmentContextPresentation } from "@/lib/department-context";

test("department-context — no available department renders nothing", () => {
  assert.equal(departmentContextPresentation(0), "hidden");
  assert.equal(departmentContextPresentation(-1), "hidden");
});

test("department-context — a single available department renders a compact identity, not a switcher", () => {
  // A single-department Manager / Quick PIN frontline user should not be forced to interact with a
  // dropdown that cannot switch anything.
  assert.equal(departmentContextPresentation(1), "compact");
});

test("department-context — multiple available departments render the selector", () => {
  // Multi-department Manager/GM and facility-wide administrators with more than one context.
  assert.equal(departmentContextPresentation(2), "selector");
  assert.equal(departmentContextPresentation(5), "selector");
});
