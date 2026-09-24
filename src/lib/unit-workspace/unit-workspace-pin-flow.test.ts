import assert from "node:assert/strict";
import test from "node:test";

import { resolveDefaultHomePath } from "@/lib/nav-zones";

/**
 * UNIT-009 — automated portion of PIN/floor regression.
 * Manual tablet checklist: docs/unit-workspace-pin-flow-checklist.md
 */

const UNIT_ID = "unit-kiosk-1";

test("PIN/kiosk staff default home is the locked unit workspace", () => {
  assert.equal(
    resolveDefaultHomePath({
      authKind: "employee",
      role: "STAFF",
      lockedUnitId: UNIT_ID,
      activeUnitId: "other-unit",
    }),
    `/unit/${UNIT_ID}`,
  );
  assert.equal(
    resolveDefaultHomePath({
      authKind: "employee",
      role: "STAFF",
      activeUnitId: UNIT_ID,
    }),
    `/unit/${UNIT_ID}`,
  );
});
