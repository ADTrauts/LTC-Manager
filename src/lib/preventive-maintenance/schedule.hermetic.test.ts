import assert from "node:assert/strict";
import test from "node:test";

import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";

import {
  addMonthsClamped,
  enumerateScheduledDates,
  firstScheduledDateOnOrAfter,
  getMaterializationDate,
  getVersionForScheduledDate,
  governingPlanVersionId,
  isOccurrenceEligibleForMaterialization,
  projectPmSchedule,
} from "./schedule";
import { facilityCivilToday, parseCivilDate } from "./civil-date";

test("monthly cadence from the 15th", () => {
  assert.deepEqual(
    enumerateScheduledDates({
      intervalMonths: 1,
      anchorDate: "2027-01-15",
      fromInclusive: "2027-01-01",
      throughInclusive: "2027-03-31",
    }),
    ["2027-01-15", "2027-02-15", "2027-03-15"],
  );
});

test("quarterly cadence is Jan Apr Jul Oct", () => {
  assert.deepEqual(
    enumerateScheduledDates({
      intervalMonths: 3,
      anchorDate: "2027-01-15",
      fromInclusive: "2027-01-01",
      throughInclusive: "2027-12-31",
    }),
    ["2027-01-15", "2027-04-15", "2027-07-15", "2027-10-15"],
  );
});

test("semiannual cadence is Jan and Jul", () => {
  assert.deepEqual(
    enumerateScheduledDates({
      intervalMonths: 6,
      anchorDate: "2027-01-15",
      fromInclusive: "2027-01-01",
      throughInclusive: "2027-12-31",
    }),
    ["2027-01-15", "2027-07-15"],
  );
});

test("annual cadence is the following January 15", () => {
  assert.deepEqual(
    enumerateScheduledDates({
      intervalMonths: 12,
      anchorDate: "2027-01-15",
      fromInclusive: "2027-01-15",
      throughInclusive: "2028-01-15",
    }),
    ["2027-01-15", "2028-01-15"],
  );
});

test("month-end clamps to the last civil day and does not drift", () => {
  assert.equal(addMonthsClamped("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonthsClamped("2027-01-31", 2), "2027-03-31");
  assert.equal(addMonthsClamped("2027-01-31", 3), "2027-04-30");
  assert.deepEqual(
    enumerateScheduledDates({
      intervalMonths: 1,
      anchorDate: "2027-01-31",
      fromInclusive: "2027-01-31",
      throughInclusive: "2027-04-30",
    }),
    ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"],
  );
});

test("leap-year Feb 29 annual clamps in non-leap years", () => {
  assert.equal(addMonthsClamped("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonthsClamped("2024-02-29", 48), "2028-02-29");
  assert.equal(firstScheduledDateOnOrAfter({
    intervalMonths: 12,
    anchorDate: "2024-02-29",
    onOrAfter: "2025-01-01",
  }), "2025-02-28");
});

test("schedule functions do not accept completion as an input", () => {
  const names = Object.getOwnPropertyNames(enumerateScheduledDates);
  assert.equal("completion" in (enumerateScheduledDates as object), false);
  assert.ok(!names.includes("completedAt"));
  const july = firstScheduledDateOnOrAfter({
    intervalMonths: 3,
    anchorDate: "2027-01-15",
    onOrAfter: "2027-05-20",
  });
  assert.equal(july, "2027-07-15");
});

test("materialization uses civil-date subtraction for generation lead", () => {
  assert.equal(getMaterializationDate("2027-10-15", 7), "2027-10-08");
  assert.equal(getMaterializationDate("2027-03-01", 1), "2027-02-28");
  assert.equal(
    isOccurrenceEligibleForMaterialization({
      scheduledDate: "2027-10-15",
      generationLeadDays: 7,
      facilityToday: "2027-10-08",
    }),
    true,
  );
  assert.equal(
    isOccurrenceEligibleForMaterialization({
      scheduledDate: "2027-10-15",
      generationLeadDays: 7,
      facilityToday: "2027-10-07",
    }),
    false,
  );
});

test("SUPERSEDED version remains schedule authority before successor effectiveDate", () => {
  const versions = [
    {
      id: "v1",
      status: "SUPERSEDED",
      effectiveDate: "2027-01-01",
      intervalMonths: 3,
      anchorDate: "2027-01-15",
    },
    {
      id: "v2",
      status: "PUBLISHED",
      effectiveDate: "2027-07-01",
      intervalMonths: 3,
      anchorDate: "2027-01-15",
    },
  ];
  assert.equal(getVersionForScheduledDate(versions, "2027-04-15")?.id, "v1");
  assert.equal(getVersionForScheduledDate(versions, "2027-07-15")?.id, "v2");
  assert.equal(getVersionForScheduledDate(versions, "2027-10-15")?.id, "v2");
  assert.equal(getVersionForScheduledDate(versions, "2026-10-15"), null);
});

test("materialized occurrence freeze beats later successor selection", () => {
  const versions = [
    {
      id: "v1",
      status: "SUPERSEDED",
      effectiveDate: "2027-01-01",
      intervalMonths: 3,
      anchorDate: "2027-01-15",
    },
    {
      id: "v2",
      status: "PUBLISHED",
      effectiveDate: "2027-07-01",
      intervalMonths: 3,
      anchorDate: "2027-01-15",
    },
  ];
  assert.equal(getVersionForScheduledDate(versions, "2027-07-15")?.id, "v2");
  assert.equal(
    governingPlanVersionId({
      occurrence: { planVersionId: "v1" },
      versions,
      scheduledDate: "2027-07-15",
    }),
    "v1",
  );
});

test("successor cadence change drops stale unmaterialized v1 dates", () => {
  const versions = [
    {
      id: "v1",
      status: "SUPERSEDED",
      effectiveDate: "2027-01-01",
      intervalMonths: 3,
      anchorDate: "2027-01-15",
    },
    {
      id: "v2",
      status: "PUBLISHED",
      effectiveDate: "2027-08-01",
      intervalMonths: 6,
      anchorDate: "2027-08-05",
    },
  ];
  const projected = projectPmSchedule(versions, {
    fromInclusive: "2027-01-01",
    throughInclusive: "2028-02-05",
  });
  assert.deepEqual(projected, [
    { scheduledDate: "2027-01-15", planVersionId: "v1" },
    { scheduledDate: "2027-04-15", planVersionId: "v1" },
    { scheduledDate: "2027-07-15", planVersionId: "v1" },
    { scheduledDate: "2027-08-05", planVersionId: "v2" },
    { scheduledDate: "2028-02-05", planVersionId: "v2" },
  ]);
  assert.ok(!projected.some((row) => row.scheduledDate === "2027-10-15"));
});

test("DRAFT is never schedule authority", () => {
  const versions = [
    {
      id: "draft",
      status: "DRAFT",
      effectiveDate: "2027-01-01",
      intervalMonths: 1,
      anchorDate: "2027-01-15",
    },
  ];
  assert.equal(getVersionForScheduledDate(versions, "2027-01-15"), null);
});

test("facility civil date does not shift across NY / UTC / DST", () => {
  const scheduled = parseCivilDate("2026-03-08");
  assert.equal(scheduled, "2026-03-08");

  const beforeSpringForward = new Date("2026-03-08T06:30:00.000Z");
  const afterSpringForward = new Date("2026-03-08T07:30:00.000Z");
  assert.equal(
    toServiceDateKey(getFacilityServiceDate("America/New_York", beforeSpringForward)),
    "2026-03-08",
  );
  assert.equal(
    toServiceDateKey(getFacilityServiceDate("America/New_York", afterSpringForward)),
    "2026-03-08",
  );

  const utcBoundary = new Date("2026-01-15T04:30:00.000Z");
  assert.equal(facilityCivilToday("America/New_York", utcBoundary), "2026-01-14");
  assert.equal(facilityCivilToday("UTC", utcBoundary), "2026-01-15");
  assert.equal(parseCivilDate("2026-01-15"), "2026-01-15");
});
