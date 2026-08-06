import assert from "node:assert/strict";
import test from "node:test";

import { detectAssignmentRevision } from "./assignment-revision";

const prior = {
  assignmentId: "a1",
  unitId: "u1",
  startsAt: "2026-08-06T15:00:00.000Z",
  endsAt: "2026-08-06T19:00:00.000Z",
};

test("no prior means no change", () => {
  const r = detectAssignmentRevision(null, {
    assignmentId: "a1",
    unitId: "u1",
    startsAt: prior.startsAt,
    endsAt: prior.endsAt,
  });
  assert.equal(r.changed, false);
  assert.equal(r.kind, null);
});

test("unit change is detected", () => {
  const r = detectAssignmentRevision(prior, {
    assignmentId: "a1",
    unitId: "u2",
    startsAt: prior.startsAt,
    endsAt: prior.endsAt,
  });
  assert.equal(r.changed, true);
  assert.equal(r.kind, "unit");
});

test("window change is detected", () => {
  const r = detectAssignmentRevision(prior, {
    assignmentId: "a1",
    unitId: "u1",
    startsAt: "2026-08-06T16:00:00.000Z",
    endsAt: prior.endsAt,
  });
  assert.equal(r.changed, true);
  assert.equal(r.kind, "window");
});

test("replaced assignment id is detected", () => {
  const r = detectAssignmentRevision(prior, {
    assignmentId: "a2",
    unitId: "u1",
    startsAt: prior.startsAt,
    endsAt: prior.endsAt,
  });
  assert.equal(r.changed, true);
  assert.equal(r.kind, "replaced");
});

test("cancelled when current missing", () => {
  const r = detectAssignmentRevision(prior, {
    assignmentId: null,
    unitId: null,
    startsAt: null,
    endsAt: null,
  });
  assert.equal(r.changed, true);
  assert.equal(r.kind, "cancelled");
});

test("identical revision is unchanged", () => {
  const r = detectAssignmentRevision(prior, {
    assignmentId: "a1",
    unitId: "u1",
    startsAt: new Date(prior.startsAt),
    endsAt: new Date(prior.endsAt),
  });
  assert.equal(r.changed, false);
  assert.equal(r.kind, null);
});
