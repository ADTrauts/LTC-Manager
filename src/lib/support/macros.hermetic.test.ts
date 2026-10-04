import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { describeSupportMacroActions, isSupportMacroAssignmentMode } from "./macros";
import type { SupportMacroRecord } from "./macros";

function sample(overrides: Partial<SupportMacroRecord> = {}): SupportMacroRecord {
  return {
    id: "m1",
    name: "Need info",
    description: null,
    isActive: true,
    savedReplyId: "r1",
    status: null,
    statusAfterReply: "WAITING_ON_CUSTOMER",
    type: null,
    priority: null,
    assignmentMode: "ME",
    assignedStaffId: null,
    tagIds: ["t1"],
    createdByStaffId: "s1",
    createdAt: new Date(),
    updatedAt: new Date(),
    savedReply: { id: "r1", name: "Need more information", body: "Hi", isActive: true },
    assignedStaff: null,
    tags: [{ id: "t1", name: "certification", normalizedName: "certification", isActive: true }],
    ...overrides,
  };
}

test("macro preview distinguishes insert, assignment, tags, and send-time status", () => {
  assert.deepEqual(describeSupportMacroActions(sample()), [
    "Insert “Need more information”",
    "Assign → Me",
    "Add tags: certification",
    "After send → Waiting on customer",
  ]);
  assert.equal(isSupportMacroAssignmentMode("UNASSIGN"), true);
  assert.equal(isSupportMacroAssignmentMode("ROUND_ROBIN"), false);
});

test("inactive saved reply is previewed as skipped, not inserted", () => {
  const lines = describeSupportMacroActions(
    sample({
      savedReply: { id: "r1", name: "Need more information", body: "Hi", isActive: false },
    }),
  );
  assert.ok(lines.some((line) => line.includes("inactive")));
});

test("macro apply is Harbor-only and never calls send from the apply action", () => {
  const page = readFileSync(join(process.cwd(), "src/app/console/(staff)/tickets/macros/page.tsx"), "utf8");
  const actions = readFileSync(join(process.cwd(), "src/app/console/(staff)/tickets/actions.ts"), "utf8");
  const panel = readFileSync(
    join(process.cwd(), "src/components/harbor-console/support-ticket-work-panel.tsx"),
    "utf8",
  );
  const body = page.slice(page.indexOf("export default"));
  assert.ok(body.indexOf("requireHarborStaff()") >= 0);
  assert.ok(body.indexOf("listSupportMacros") > body.indexOf("requireHarborStaff()"));
  const apply = actions.slice(actions.indexOf("export async function applySupportMacroAction"));
  assert.match(apply, /requireHarborStaff\(\)/);
  assert.equal(apply.includes("sendSupportReply"), false);
  assert.match(panel, /Nothing is emailed/);
  assert.match(panel, /append/);
});
