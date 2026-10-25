import assert from "node:assert/strict";
import test from "node:test";

import {
  presentFiledRequests,
  presentLicensing,
  presentPeopleAlerts,
  presentReviewYesterday,
  presentTeamsAtAGlance,
} from "./dsh05";

test("people alerts stay quiet when nothing needs a leader", () => {
  const result = presentPeopleAlerts([]);
  assert.equal(result.state, "quiet");
});

test("people alerts name the person and the issue", () => {
  const result = presentPeopleAlerts([{ id: "pin:1", title: "Sam Supervisor", detail: "PIN not set" }]);
  assert.equal(result.state, "ready");
  if (result.state !== "ready") return;
  assert.equal(result.model.lines[0]?.title, "Sam Supervisor");
  assert.equal(result.model.lines[0]?.href, "/employees");
});

test("teams at a glance list only teams with a room that needs attention", () => {
  const quiet = presentTeamsAtAGlance([{ id: "t1", name: "Kitchen", attention: 0, departmentId: "dept" }]);
  assert.equal(quiet.state, "quiet");
  const result = presentTeamsAtAGlance([{ id: "t1", name: "Kitchen", attention: 2, departmentId: "dept" }]);
  assert.equal(result.state, "ready");
  if (result.state !== "ready") return;
  assert.equal(result.model.lines[0]?.href, "/dashboard?scope=team:dept");
});

test("yesterday stays quiet when the review has nothing to look at", () => {
  const result = presentReviewYesterday([{ serviceDate: "2026-10-22", items: [] }]);
  assert.equal(result.state, "quiet");
  const ready = presentReviewYesterday([
    { serviceDate: "2026-10-22", items: [{ id: "evidence-missed", label: "1 evidence item missed" }] },
  ]);
  assert.equal(ready.state, "ready");
  if (ready.state === "ready") assert.equal(ready.model.lines[0]?.href, "/reports?date=2026-10-22");
});
test("filed requests and licensing name what is open or not licensed", () => {
  const requests = presentFiledRequests([{ id: "r1", code: "RQ-1", summary: "Oven down", statusLabel: "Received" }]);
  assert.equal(requests.state, "ready");
  if (requests.state === "ready") assert.equal(requests.model.lines[0]?.href, "/repairs");
  const licensing = presentLicensing([{ id: "d1", name: "Food & Nutrition", licensed: false, active: true }]);
  assert.equal(licensing.state, "ready");
  if (licensing.state === "ready") assert.match(licensing.model.lines[0]?.detail ?? "", /Not licensed/);
});
