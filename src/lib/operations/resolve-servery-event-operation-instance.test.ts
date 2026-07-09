import assert from "node:assert/strict";
import test from "node:test";

import { MealType } from "@prisma/client";

import { resolveServeryEventOperationInstanceId } from "@/lib/operations/resolve-servery-event-operation-instance";

const input = {
  facilityId: "facility-1",
  serviceDate: new Date("2026-07-08T00:00:00"),
  mealType: MealType.LUNCH,
};

const prismaStub = {} as never;

test("resolveServeryEventOperationInstanceId returns null when operation engine flag is off", async () => {
  const id = await resolveServeryEventOperationInstanceId(input, prismaStub, {
    isEngineEnabled: () => false,
    findInstance: async () => {
      throw new Error("should not query instances when flag is off");
    },
  });

  assert.equal(id, null);
});

test("resolveServeryEventOperationInstanceId returns matching instance when flag is on", async () => {
  const id = await resolveServeryEventOperationInstanceId(input, prismaStub, {
    isEngineEnabled: () => true,
    hasPrisma: () => true,
    resolveDepartmentId: async () => "dept-dietary",
    findInstance: async () => ({ id: "op-lunch" }),
  });

  assert.equal(id, "op-lunch");
});

test("resolveServeryEventOperationInstanceId falls back to null when no instance exists", async () => {
  const id = await resolveServeryEventOperationInstanceId(input, prismaStub, {
    isEngineEnabled: () => true,
    hasPrisma: () => true,
    resolveDepartmentId: async () => "dept-dietary",
    findInstance: async () => null,
  });

  assert.equal(id, null);
});

test("resolveServeryEventOperationInstanceId falls back when operation prisma delegates are missing", async () => {
  const id = await resolveServeryEventOperationInstanceId(input, prismaStub, {
    isEngineEnabled: () => true,
    hasPrisma: () => false,
    findInstance: async () => {
      throw new Error("should not query instances when prisma delegates are missing");
    },
  });

  assert.equal(id, null);
});
