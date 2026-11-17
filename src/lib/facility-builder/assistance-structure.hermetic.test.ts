import assert from "node:assert/strict";
import test from "node:test";
import { readAssistanceStructure, AssistanceStructureTooLarge } from "./assistance-structure";

const client = (unitCount: number, spaceCount: number) => ({
  facility: { findUnique: async () => ({ id: "a", displayName: "Synthetic A" }) },
  unit: { findMany: async () => Array.from({ length: unitCount }, (_, i) => ({
    id: `unit-${i}`, name: "Floor", hierarchyRole: "FLOOR", parentUnitId: null, displayOrder: i,
  })) },
  unitSpace: { findMany: async () => Array.from({ length: spaceCount }, (_, i) => ({
    id: `space-${i}`, name: "Storage", spaceType: "STORAGE", unitId: "unit-0", parentSpaceId: null, sortOrder: i,
  })) },
}) as unknown as Parameters<typeof readAssistanceStructure>[0];

test("the structure reader refuses to return a partial view above either cap", async () => {
  const atLimit = await readAssistanceStructure(client(250, 1000), "a");
  assert.ok(atLimit);
  assert.equal(atLimit.units.length, 250);
  assert.equal(atLimit.units[0].spaces.length, 1000);
  await assert.rejects(readAssistanceStructure(client(251, 1), "a"), AssistanceStructureTooLarge);
  await assert.rejects(readAssistanceStructure(client(1, 1001), "a"), AssistanceStructureTooLarge);
});
