import assert from "node:assert/strict";
import test from "node:test";

import { IssueType } from "@prisma/client";

import { ISSUE_TYPE_OPTIONS, issueTypeLabel } from "@/lib/repair-routing";

test("all IssueType values are represented in quick-report options", () => {
  const values = new Set(ISSUE_TYPE_OPTIONS.map((option) => option.value));
  for (const value of Object.values(IssueType)) {
    assert.ok(values.has(value), `missing option for ${value}`);
    assert.ok(issueTypeLabel(value).length > 0);
  }
});
