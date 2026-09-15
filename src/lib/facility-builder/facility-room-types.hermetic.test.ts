import assert from "node:assert/strict";
import test from "node:test";
import { SpaceType } from "@prisma/client";

import {
  FACILITY_BASE_TYPES,
  baseTypeKeyFromLegacyRoomIdentity,
  findFacilityBaseType,
  legacyFieldsForFacilityRoomType,
  requireFacilityBaseType,
} from "./facility-base-types";
import {
  createFacilityRoomType,
  updateFacilityRoomType,
  archiveOrDeleteFacilityRoomType,
  backfillFacilityRoomTypesForFacility,
} from "./facility-room-types";

test("base type catalog includes kitchen and guest_room but not servery", () => {
  assert.ok(findFacilityBaseType("kitchen"));
  assert.ok(findFacilityBaseType("guest_room"));
  assert.equal(findFacilityBaseType("servery"), undefined);
  assert.ok(FACILITY_BASE_TYPES.every((row) => row.key !== "servery"));
});

test("Servery and Main Kitchen share Kitchen base type", () => {
  const servery = baseTypeKeyFromLegacyRoomIdentity({
    presetKey: "servery",
    spaceType: SpaceType.SERVICE_AREA,
    customTypeLabel: "Servery",
  });
  const mainKitchen = baseTypeKeyFromLegacyRoomIdentity({
    presetKey: "production_area",
    spaceType: SpaceType.PRODUCTION_AREA,
    customTypeLabel: "Main Kitchen",
  });
  assert.equal(servery.baseTypeKey, "kitchen");
  assert.equal(mainKitchen.baseTypeKey, "kitchen");
  assert.equal(requireFacilityBaseType("kitchen").label, "Kitchen");
});

test("hotel room variants share guest_room base type", () => {
  for (const label of ["King Room", "Double Queen", "Suite"]) {
    const mapped = baseTypeKeyFromLegacyRoomIdentity({
      presetKey: "custom",
      spaceType: SpaceType.PATIENT_ROOM,
      customTypeLabel: label,
    });
    // custom + PATIENT_ROOM via spaceType path when preset is custom
    const fromSpace = baseTypeKeyFromLegacyRoomIdentity({
      spaceType: SpaceType.PATIENT_ROOM,
      customTypeLabel: label,
    });
    assert.equal(fromSpace.baseTypeKey, "guest_room");
    void mapped;
  }
});

test("unknown custom maps to other without guessing", () => {
  const mapped = baseTypeKeyFromLegacyRoomIdentity({
    presetKey: "custom",
    spaceType: SpaceType.OTHER,
    customTypeLabel: "Nutrition Supply Room",
  });
  assert.equal(mapped.baseTypeKey, "other");
  assert.equal(mapped.confident, false);
});

test("legacyFieldsForFacilityRoomType dual-writes Servery as SERVICE_AREA", () => {
  const servery = legacyFieldsForFacilityRoomType({
    baseTypeKey: "kitchen",
    displayName: "Servery",
  });
  assert.equal(servery.spaceType, SpaceType.SERVICE_AREA);
  assert.equal(servery.customTypeLabel, "Servery");

  const main = legacyFieldsForFacilityRoomType({
    baseTypeKey: "kitchen",
    displayName: "Main Kitchen",
  });
  assert.equal(main.spaceType, SpaceType.PRODUCTION_AREA);
  assert.equal(main.customTypeLabel, "Main Kitchen");
});

test("facility room type rename preserves id and updates dual-write labels", async () => {
  const spaces: Array<{
    id: string;
    facilityId: string;
    facilityRoomTypeId: string | null;
    spaceType: SpaceType;
    customTypeLabel: string | null;
  }> = [
    {
      id: "s1",
      facilityId: "fac1",
      facilityRoomTypeId: "rt1",
      spaceType: SpaceType.SERVICE_AREA,
      customTypeLabel: "Servery",
    },
  ];
  const types = new Map([
    [
      "rt1",
      {
        id: "rt1",
        facilityId: "fac1",
        baseTypeKey: "kitchen",
        displayName: "Servery",
        description: null as string | null,
        displayOrder: 10,
        isActive: true,
        archivedAt: null as Date | null,
      },
    ],
  ]);

  const client = {
    facilityRoomType: {
      findFirst: async ({ where }: { where: { id: string; facilityId: string } }) => {
        const row = types.get(where.id);
        if (!row || row.facilityId !== where.facilityId) return null;
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const prior = types.get(where.id)!;
        const next = { ...prior, ...data };
        types.set(where.id, next as typeof prior);
        return {
          ...next,
          _count: { spaces: spaces.filter((s) => s.facilityRoomTypeId === where.id).length },
        };
      },
    },
    unitSpace: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { facilityRoomTypeId: string };
        data: { customTypeLabel: string; spaceType: SpaceType };
      }) => {
        for (const space of spaces) {
          if (space.facilityRoomTypeId === where.facilityRoomTypeId) {
            space.customTypeLabel = data.customTypeLabel;
            space.spaceType = data.spaceType;
          }
        }
        return { count: 1 };
      },
    },
  };

  const updated = await updateFacilityRoomType(
    {
      facilityId: "fac1",
      id: "rt1",
      displayName: "Neighborhood Kitchen",
    },
    client as never,
  );

  assert.equal(updated.id, "rt1");
  assert.equal(updated.displayName, "Neighborhood Kitchen");
  assert.equal(spaces[0]!.customTypeLabel, "Neighborhood Kitchen");
  assert.equal(types.get("rt1")!.displayName, "Neighborhood Kitchen");
});

test("archiveOrDelete blocks hard delete while rooms reference the type", async () => {
  const client = {
    facilityRoomType: {
      findFirst: async () => ({
        id: "rt1",
        facilityId: "fac1",
        _count: { spaces: 17 },
      }),
      update: async () => ({ id: "rt1" }),
      delete: async () => {
        throw new Error("should not delete");
      },
    },
  };
  const result = await archiveOrDeleteFacilityRoomType(
    { facilityId: "fac1", id: "rt1" },
    client as never,
  );
  assert.equal(result.action, "archived");
  assert.equal(result.roomCount, 17);
});

test("backfill groups rooms by visible identity and preserves labels", async () => {
  const created: Array<{ displayName: string; baseTypeKey: string }> = [];
  const linked: string[] = [];
  const client = {
    unitSpace: {
      findMany: async () => [
        {
          id: "a",
          spaceType: SpaceType.SERVICE_AREA,
          customTypeLabel: "Servery",
        },
        {
          id: "b",
          spaceType: SpaceType.SERVICE_AREA,
          customTypeLabel: "Servery",
        },
        {
          id: "c",
          spaceType: SpaceType.OTHER,
          customTypeLabel: "Nutrition Supply Room",
        },
      ],
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: { facilityRoomTypeId: string };
      }) => {
        linked.push(...where.id.in.map((id) => `${id}:${data.facilityRoomTypeId}`));
        return { count: where.id.in.length };
      },
    },
    facilityRoomType: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({
        data,
      }: {
        data: { displayName: string; baseTypeKey: string };
      }) => {
        const id = `rt-${created.length + 1}`;
        created.push({ displayName: data.displayName, baseTypeKey: data.baseTypeKey });
        return { id, ...data };
      },
    },
  };

  const report = await backfillFacilityRoomTypesForFacility("fac1", client as never);
  assert.equal(report.typesCreated, 2);
  assert.equal(report.roomsLinked, 3);
  assert.ok(created.some((row) => row.displayName === "Servery" && row.baseTypeKey === "kitchen"));
  assert.ok(
    created.some(
      (row) => row.displayName === "Nutrition Supply Room" && row.baseTypeKey === "other",
    ),
  );
  assert.ok(report.ambiguousLabels.includes("Nutrition Supply Room"));
  assert.equal(linked.filter((row) => row.startsWith("a:")).length, 1);
  assert.equal(linked.filter((row) => row.startsWith("b:")).length, 1);
});

test("createFacilityRoomType rejects duplicate names", async () => {
  const client = {
    facilityRoomType: {
      create: async () => {
        const err = new Error("unique") as Error & { code: string };
        err.code = "P2002";
        throw err;
      },
    },
  };
  await assert.rejects(
    () =>
      createFacilityRoomType(
        { facilityId: "fac1", displayName: "Servery", baseTypeKey: "kitchen" },
        client as never,
      ),
    /already exists/,
  );
});
