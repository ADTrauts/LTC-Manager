import assert from "node:assert/strict";
import test from "node:test";

import { presentIssueAuthority } from "./issue-semantics";

test("Issue status projects OPEN / MONITORING / RESOLVED / CANCELED without rewriting storage", () => {
  assert.equal(presentIssueAuthority("REPORTED"), "OPEN");
  assert.equal(presentIssueAuthority("ACKNOWLEDGED"), "OPEN");
  assert.equal(presentIssueAuthority("TRIAGED"), "OPEN");
  assert.equal(presentIssueAuthority("MONITORING"), "MONITORING");
  assert.equal(presentIssueAuthority("RESOLVED"), "RESOLVED");
  assert.equal(presentIssueAuthority("CLOSED"), "RESOLVED");
  assert.equal(presentIssueAuthority("CANCELLED"), "CANCELED");
});
