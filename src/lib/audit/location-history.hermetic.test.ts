import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LOCATION_HISTORY_SOURCES } from "./history-boundaries";

test("Location History sources include Request, Issue, and Repair", () => {
  assert.ok(LOCATION_HISTORY_SOURCES.includes("OperationalRequest"));
  assert.ok(LOCATION_HISTORY_SOURCES.includes("AssetIssue"));
  assert.ok(LOCATION_HISTORY_SOURCES.includes("Repair"));
  assert.ok(LOCATION_HISTORY_SOURCES.includes("OperationalEvidenceRecord"));
});

test("Location History is a projection, not a copied ledger", () => {
  const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.doesNotMatch(schema, /model LocationHistory/);
  assert.doesNotMatch(schema, /model LocationHistoryEntry/);
  const projector = readFileSync(new URL("./location-history.ts", import.meta.url), "utf8");
  assert.match(projector, /There is no LocationHistory ledger table/);
  assert.match(projector, /operationalRequest\.findMany/);
  assert.match(projector, /assetIssue\.findMany/);
  assert.match(projector, /repair\.findMany/);
});

test("historical Location uses stored unit/space, not live Asset location", () => {
  const projector = readFileSync(new URL("./location-history.ts", import.meta.url), "utf8");
  assert.doesNotMatch(projector, /asset\.unitId/);
  assert.doesNotMatch(projector, /asset\.spaceId/);
  assert.match(projector, /spaceId: request\.spaceId/);
  assert.match(projector, /spaceId: issue\.spaceId/);
  assert.match(projector, /spaceId: repair\.spaceId/);
});

test("Repair Location History does not invent space from live Asset", () => {
  const projector = readFileSync(new URL("./location-history.ts", import.meta.url), "utf8");
  assert.match(projector, /optional spaceId/);
  assert.match(projector, /matchesSpaceFilter\(repair\.spaceId, spaceId\)/);
  assert.doesNotMatch(projector, /asset\.spaceId/);
});
