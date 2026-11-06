import assert from "node:assert/strict";
import test from "node:test";

import {
  profileCoversServiceDate,
  selectHistoricalProfileForServiceDate,
} from "./historical-operational-type";
import type { ReviewProfileFact } from "./types";

const TZ = "America/New_York";

function profile(overrides: Partial<ReviewProfileFact> & Pick<ReviewProfileFact, "id" | "version">): ReviewProfileFact {
  return {
    departmentId: "dept-1",
    status: "RETIRED",
    activatedAt: new Date("2026-09-01T12:00:00.000Z"),
    retiredAt: new Date("2026-09-05T12:00:00.000Z"),
    ...overrides,
  };
}

test("OT v1 remains selected on a date before v2 activation", () => {
  const v1 = profile({
    id: "p1",
    version: 1,
    status: "RETIRED",
    activatedAt: new Date("2026-09-01T14:00:00.000Z"),
    retiredAt: new Date("2026-09-05T14:00:00.000Z"),
  });
  const v2 = profile({
    id: "p2",
    version: 2,
    status: "ACTIVE",
    activatedAt: new Date("2026-09-05T14:00:00.000Z"),
    retiredAt: null,
  });
  const selected = selectHistoricalProfileForServiceDate([v1, v2], {
    departmentId: "dept-1",
    serviceDateKey: "2026-09-02",
    timezone: TZ,
  });
  assert.equal(selected.status, "evaluated");
  if (selected.status !== "evaluated") return;
  assert.equal(selected.profile.id, "p1");
  assert.equal(selected.profile.version, 1);
});

test("today's ACTIVE profile is not used for an earlier service date", () => {
  const v2 = profile({
    id: "p2",
    version: 2,
    status: "ACTIVE",
    activatedAt: new Date("2026-09-05T14:00:00.000Z"),
    retiredAt: null,
  });
  const selected = selectHistoricalProfileForServiceDate([v2], {
    departmentId: "dept-1",
    serviceDateKey: "2026-09-02",
    timezone: TZ,
  });
  assert.equal(selected.status, "unavailable");
  if (selected.status !== "unavailable") return;
  assert.equal(selected.reason, "no_historical_ot_version");
});

test("profile coverage uses facility timezone around UTC midnight", () => {
  // 2026-09-02 03:30 UTC = 2026-09-01 23:30 America/New_York
  const activatedAt = new Date("2026-09-02T03:30:00.000Z");
  assert.equal(profileCoversServiceDate({ activatedAt, retiredAt: null }, "2026-09-01", TZ), true);
  assert.equal(profileCoversServiceDate({ activatedAt, retiredAt: null }, "2026-08-31", TZ), false);
});
