import assert from "node:assert/strict";
import test from "node:test";

import { auditOperationalRecords } from "@/lib/audit/audit-records";
import type { LogExpectationHistorySegment } from "@/lib/canonical-logs/expectation-history";
import { composeLocationProgram } from "@/lib/department-administration/location-program";

import {
  matchLogAttachmentToLocation,
  type LocationLogAttachmentRow,
  type LocationLogMatchContext,
} from "./log-operational-type-applicability";

function row(
  overrides: Partial<LocationLogAttachmentRow> & Pick<LocationLogAttachmentRow, "id" | "targetKind">,
): LocationLogAttachmentRow {
  return {
    departmentId: "dietary",
    catalogStableKey: "temp",
    catalogVersion: 1,
    label: "Temperature",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    assetId: null,
    status: "ACTIVE",
    ...overrides,
  };
}

function ctx(overrides: Partial<LocationLogMatchContext> & Pick<LocationLogMatchContext, "spaceId">): LocationLogMatchContext {
  return {
    facilityId: "facility-1",
    departmentId: "dietary",
    unitId: "unit-1",
    ...overrides,
  };
}

test("an explicit space requirement applies only to that space", () => {
  const requirement = row({ id: "a", targetKind: "SPACE", spaceId: "space-a" });
  assert.equal(matchLogAttachmentToLocation(requirement, ctx({ spaceId: "space-a" }))?.source, "EXPLICIT_LOCATION");
  assert.equal(matchLogAttachmentToLocation(requirement, ctx({ spaceId: "space-b" })), null);
});

test("several explicit spaces stay explicit", () => {
  const requirements = ["space-a", "space-b", "space-c"].map((spaceId) =>
    row({ id: spaceId, targetKind: "SPACE", spaceId }),
  );
  for (const spaceId of ["space-a", "space-b", "space-c"]) {
    assert.equal(
      requirements.some((requirement) => matchLogAttachmentToLocation(requirement, ctx({ spaceId }))),
      true,
    );
  }
  assert.equal(
    requirements.some((requirement) => matchLogAttachmentToLocation(requirement, ctx({ spaceId: "space-d" }))),
    false,
  );
});

test("a new room of the same Facility Room Type does not inherit the requirement", () => {
  const existing = ["space-a", "space-b", "space-c"].map((spaceId) =>
    row({ id: spaceId, targetKind: "SPACE", spaceId }),
  );
  const inherited = row({
    id: "type",
    targetKind: "OPERATIONAL_TYPE",
    operationalTypeKey: "servery",
  });
  const spaceD = ctx({ spaceId: "space-d", operationalTypeKey: "servery", operationalTypeName: "Servery" });
  assert.equal(existing.some((requirement) => matchLogAttachmentToLocation(requirement, spaceD)), false);
  assert.equal(matchLogAttachmentToLocation(inherited, spaceD), null);
});

test("UNIT applies to Spaces in that Unit and ignores other Units", () => {
  const requirement = row({ id: "unit", targetKind: "UNIT", unitId: "unit-1" });
  assert.equal(
    matchLogAttachmentToLocation(requirement, ctx({ spaceId: "room", unitId: "unit-1" }))?.source,
    "UNIT",
  );
  assert.equal(matchLogAttachmentToLocation(requirement, ctx({ spaceId: "room", unitId: "unit-2" })), null);
});

test("DEPARTMENT and FACILITY match within Department scope; OT no longer expands", () => {
  const department = row({ id: "dept", targetKind: "DEPARTMENT", targetDepartmentId: "dietary" });
  const facility = row({ id: "fac", targetKind: "FACILITY" });
  assert.equal(matchLogAttachmentToLocation(department, ctx({ spaceId: "room" }))?.source, "DEPARTMENT_WIDE");
  assert.equal(
    matchLogAttachmentToLocation(department, ctx({ spaceId: "room", departmentId: "evs" })),
    null,
  );
  assert.equal(matchLogAttachmentToLocation(facility, ctx({ spaceId: "room" }))?.source, "FACILITY");
  assert.equal(
    matchLogAttachmentToLocation(
      row({ id: "ot", targetKind: "OPERATIONAL_TYPE", operationalTypeKey: "servery" }),
      ctx({ spaceId: "room", operationalTypeKey: "servery", operationalTypeName: "Servery" }),
    ),
    null,
  );
});

test("an asset requirement matches that asset and not the room", () => {
  const requirement = row({ id: "asset", targetKind: "ASSET", assetId: "dish" });
  assert.equal(matchLogAttachmentToLocation(requirement, ctx({ spaceId: "room" })), null);
  assert.equal(
    matchLogAttachmentToLocation(requirement, ctx({ spaceId: "room", assetId: "dish" }))?.source,
    "ASSET",
  );
});

test("two departments can require different records on the same room", () => {
  const food = row({ id: "food", targetKind: "SPACE", spaceId: "shared", departmentId: "dietary" });
  const evs = row({
    id: "evs",
    targetKind: "SPACE",
    spaceId: "shared",
    departmentId: "evs",
    catalogStableKey: "evs-clean",
  });
  assert.equal(matchLogAttachmentToLocation(food, ctx({ spaceId: "shared", departmentId: "dietary" }))?.attachment.id, "food");
  assert.equal(matchLogAttachmentToLocation(evs, ctx({ spaceId: "shared", departmentId: "dietary" })), null);
  assert.equal(matchLogAttachmentToLocation(evs, ctx({ spaceId: "shared", departmentId: "evs" }))?.attachment.id, "evs");
  assert.equal(matchLogAttachmentToLocation(food, ctx({ spaceId: "shared", departmentId: "evs" })), null);
});

function historySegment(
  overrides: Partial<LogExpectationHistorySegment> & Pick<LogExpectationHistorySegment, "id" | "effectiveFrom">,
): LogExpectationHistorySegment {
  return {
    stableKey: "servery-temp",
    facilityId: "facility-1",
    departmentId: "dietary",
    catalogStableKey: "servery_temp",
    catalogVersion: 1,
    status: "ACTIVE",
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: "Daily Servery Temperature",
    localInstructions: null,
    targetKind: "SPACE",
    assetId: null,
    spaceId: "space-a",
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    dailyWindows: [
      { label: "Morning", startLocal: "06:00", endLocal: "10:00", displaySequence: 10 },
    ],
    cycleSelections: [],
    catalogDefinition: {
      id: "cat-1",
      name: "Daily Servery Temperature",
      purposeType: "LOG",
      instructions: null,
      status: "PUBLISHED",
      fields: [],
    },
    ...overrides,
  };
}

test("audit reconstructs a past space requirement from the attachment interval", () => {
  const segment = historySegment({
    id: "jan-june",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-06-30T00:00:00.000Z"),
  });
  const later = historySegment({
    id: "after",
    stableKey: "servery-temp-later",
    spaceId: "space-b",
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
  });
  const march = auditOperationalRecords({
    fromDateKey: "2026-03-15",
    toDateKey: "2026-03-15",
    todayKey: "2026-11-02",
    now: new Date("2026-11-02T16:00:00.000Z"),
    facilityTimezone: "America/New_York",
    departmentId: "dietary",
    segments: [segment, later],
    profiles: [],
    bindings: [],
    spaces: [
      { spaceId: "space-a", currentLabel: "1A Servery" },
      { spaceId: "space-b", currentLabel: "1B Servery" },
    ],
    placeNames: [],
    records: [],
    waivers: [],
  });
  assert.equal(march.slots.length > 0, true);
  assert.equal(march.slots.every((slot) => slot.spaceId === "space-a"), true);
  assert.equal(march.slots.some((slot) => slot.spaceId === "space-b"), false);

  const august = auditOperationalRecords({
    fromDateKey: "2026-08-01",
    toDateKey: "2026-08-01",
    todayKey: "2026-11-02",
    now: new Date("2026-11-02T16:00:00.000Z"),
    facilityTimezone: "America/New_York",
    departmentId: "dietary",
    segments: [segment, later],
    profiles: [],
    bindings: [],
    spaces: [{ spaceId: "space-a", currentLabel: "1A Servery" }],
    placeNames: [],
    records: [],
    waivers: [],
  });
  assert.equal(august.slots.every((slot) => slot.spaceId === "space-b"), true);
  assert.equal(august.slots.some((slot) => slot.spaceId === "space-a"), false);
});

test("location program may show Facility-type defaults as Build overlay only", () => {
  const program = composeLocationProgram({
    departmentId: "dietary",
    departmentName: "Food & Nutrition",
    location: {
      spaceId: "space-d",
      name: "1D Servery",
      neighborhoodName: null,
      floorName: "1",
      facilityTypeLabel: "Servery",
      facilityRoomTypeId: "servery",
      responsible: true,
    },
    teams: [],
    teamCycles: [],
    cyclePlacements: [],
    spaceLogs: [],
    assetLogs: [],
    typeDefaults: [
      { id: "def-1", label: "Daily Servery Temperature", facilityRoomTypeId: "servery", typeLabel: "Servery" },
    ],
    suppressions: [],
    assets: [],
  });
  // Build compatibility surface — not a Run LogAttachment. Forward authoring of new
  // type defaults is retired; existing defaults may still appear in the inspector.
  assert.equal(program.logs.length, 1);
  assert.equal(program.logs[0]?.kind, "TYPE_DEFAULT");
  assert.equal(program.logs[0]?.attachmentId, null);
  assert.match(program.logs[0]?.provenance.detail ?? "", /Facility type/i);
});
