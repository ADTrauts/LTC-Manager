import assert from "node:assert/strict";
import test from "node:test";

import { operationalListRowClass } from "@/components/design-system/OperationalListRow";

test("operationalListRowClass emphasizes primary route rows", () => {
  assert.match(operationalListRowClass(true), /border-zinc-900/);
  assert.equal(operationalListRowClass(false), "py-3");
});
