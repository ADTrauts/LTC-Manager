import assert from "node:assert/strict";
import test from "node:test";

import {
  groupLogicalLogAttachments,
  logicalAttachmentsForBuildList,
} from "./logical-attachment";

function seg(overrides: Partial<Parameters<typeof groupLogicalLogAttachments>[0][number]> & { id: string }) {
  return {
    stableKey: overrides.stableKey ?? overrides.id,
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
    status: "INACTIVE" as const,
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-09-10T00:00:00.000Z"),
    targetKind: "ASSET",
    assetId: "asset-1",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    ...overrides,
  };
}

test("groups successor rows into one logical Attachment", () => {
  const groups = groupLogicalLogAttachments(
    [
      seg({ id: "old", status: "INACTIVE", catalogVersion: 3 }),
      seg({
        id: "new",
        status: "ACTIVE",
        catalogVersion: 4,
        effectiveFrom: new Date("2026-09-11T00:00:00.000Z"),
        effectiveTo: null,
      }),
    ],
    new Map([["cooler_temperature_log", 4]]),
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.current.id, "new");
  assert.equal(groups[0]!.prior.length, 1);
  assert.equal(groups[0]!.updateAvailable, false);
  assert.equal(logicalAttachmentsForBuildList(groups).length, 1);
});

test("retired current segments are hidden from BUILD list", () => {
  const groups = groupLogicalLogAttachments([
    seg({
      id: "retired",
      status: "RETIRED",
      effectiveTo: new Date("2026-09-10T00:00:00.000Z"),
    }),
  ]);
  assert.equal(logicalAttachmentsForBuildList(groups).length, 0);
});

test("update available when a newer published Catalog version exists", () => {
  const groups = groupLogicalLogAttachments(
    [
      seg({
        id: "live",
        status: "ACTIVE",
        catalogVersion: 3,
        effectiveTo: null,
      }),
    ],
    new Map([["cooler_temperature_log", 4]]),
  );
  assert.equal(groups[0]!.updateAvailable, true);
});
