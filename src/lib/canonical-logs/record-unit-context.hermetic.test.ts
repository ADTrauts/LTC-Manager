import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import { evidenceCanCreateIssue } from "./evidence-rules";
import { resolveRecordUnitContext } from "./record-unit-context";

test("asset evidence captures a facility-scoped unit so an exception can create an Issue", async () => {
  const client = { asset: { findFirst: async (query: unknown) => {
    assert.deepEqual(query, { where: { id: "cooler", unit: { facilityId: "terrace" } }, select: { unitId: true } });
    return { unitId: "kitchen" };
  } } } as unknown as PrismaClient;
  const unitId = await resolveRecordUnitContext(client, { facilityId: "terrace", assetId: "cooler", unitId: null });
  assert.equal(unitId, "kitchen");
  assert.equal(evidenceCanCreateIssue({ assetId: "cooler", unitId, outOfStandard: true }), true);
  assert.equal(evidenceCanCreateIssue({ assetId: "cooler", unitId, outOfStandard: false }), false);
});

test("foreign or missing assets fail closed; other target kinds retain their unit", async () => {
  const client = { asset: { findFirst: async () => null } } as unknown as PrismaClient;
  await assert.rejects(resolveRecordUnitContext(client, { facilityId: "terrace", assetId: "foreign", unitId: null }), /not available/);
  assert.equal(await resolveRecordUnitContext(client, { facilityId: "terrace", assetId: null, unitId: "kitchen" }), "kitchen");
  assert.equal(await resolveRecordUnitContext(client, { facilityId: "terrace", assetId: null, unitId: null }), null);
});
