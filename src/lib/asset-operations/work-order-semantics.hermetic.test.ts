import assert from "node:assert/strict";
import test from "node:test";

import { getDepartmentProduct } from "@/lib/department-products";

import {
  ALL_REPAIR_PRIORITIES,
  ALL_REPAIR_STATUSES,
  DEFAULT_MAINTENANCE_CATEGORIES,
  mapRepairTradeToCategoryKey,
  presentWorkOrder,
  presentWorkOrderHoldReason,
  presentWorkOrderPriority,
  presentWorkOrderStatus,
  resolveStoredHoldWrite,
} from "./work-order-semantics";

test("Facility Plant Operations is AVAILABLE", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "AVAILABLE");
});

test("every stored RepairStatus maps to one canonical Work Order status", () => {
  const expected: Record<string, string> = {
    OPEN: "OPEN",
    ASSIGNED: "ASSIGNED",
    IN_PROGRESS: "IN_PROGRESS",
    WAITING_PARTS: "ON_HOLD",
    WAITING_ON_VENDOR: "ON_HOLD",
    ON_HOLD: "ON_HOLD",
    COMPLETED: "COMPLETED",
    CLOSED: "COMPLETED",
    CANCELLED: "CANCELED",
  };
  for (const status of ALL_REPAIR_STATUSES) {
    assert.equal(presentWorkOrderStatus(status), expected[status], status);
  }
  assert.equal(Object.keys(expected).length, ALL_REPAIR_STATUSES.length);
});

test("legacy waiting statuses infer hold reason; new ON_HOLD uses stored reason", () => {
  assert.equal(
    presentWorkOrderHoldReason({ status: "WAITING_PARTS", holdReason: null }),
    "WAITING_FOR_PART",
  );
  assert.equal(
    presentWorkOrderHoldReason({ status: "WAITING_ON_VENDOR", holdReason: null }),
    "WAITING_FOR_VENDOR",
  );
  assert.equal(
    presentWorkOrderHoldReason({ status: "ON_HOLD", holdReason: "WAITING_FOR_VENDOR" }),
    "WAITING_FOR_VENDOR",
  );
  assert.equal(presentWorkOrderHoldReason({ status: "OPEN", holdReason: null }), null);
});

test("new hold writes persist ON_HOLD plus reason, not WAITING_*", () => {
  assert.deepEqual(resolveStoredHoldWrite("WAITING_PARTS"), {
    status: "ON_HOLD",
    holdReason: "WAITING_FOR_PART",
  });
  assert.deepEqual(resolveStoredHoldWrite("WAITING_ON_VENDOR"), {
    status: "ON_HOLD",
    holdReason: "WAITING_FOR_VENDOR",
  });
  assert.deepEqual(resolveStoredHoldWrite("ON_HOLD", "WAITING_FOR_ACCESS"), {
    status: "ON_HOLD",
    holdReason: "WAITING_FOR_ACCESS",
  });
  assert.deepEqual(resolveStoredHoldWrite("IN_PROGRESS"), {
    status: "IN_PROGRESS",
    holdReason: null,
  });
});

test("every stored RepairPriority maps; LOW/MEDIUM are ROUTINE; EMERGENCY is additive", () => {
  assert.equal(presentWorkOrderPriority("LOW"), "ROUTINE");
  assert.equal(presentWorkOrderPriority("MEDIUM"), "ROUTINE");
  assert.equal(presentWorkOrderPriority("HIGH"), "HIGH");
  assert.equal(presentWorkOrderPriority("URGENT"), "URGENT");
  assert.equal(presentWorkOrderPriority("EMERGENCY"), "EMERGENCY");
  assert.equal(ALL_REPAIR_PRIORITIES.includes("EMERGENCY"), true);
});

test("legacy RepairTrade maps deterministically without inventing kitchen", () => {
  assert.equal(mapRepairTradeToCategoryKey("PLUMBING"), "PLUMBING");
  assert.equal(mapRepairTradeToCategoryKey("ELECTRICAL"), "ELECTRICAL");
  assert.equal(mapRepairTradeToCategoryKey("EQUIPMENT"), "GENERAL_REPAIR");
  assert.equal(mapRepairTradeToCategoryKey("GENERAL"), "GENERAL_REPAIR");
});

test("default maintenance categories are deterministic and unique", () => {
  const keys = DEFAULT_MAINTENANCE_CATEGORIES.map((row) => row.key);
  assert.deepEqual(keys, [
    "HVAC",
    "PLUMBING",
    "ELECTRICAL",
    "LIFE_SAFETY",
    "KITCHEN_EQUIPMENT",
    "CARPENTRY_BUILDING",
    "GROUNDS",
    "GENERAL_REPAIR",
  ]);
  assert.equal(new Set(keys).size, keys.length);
});

test("presentWorkOrder hides legacy WAITING_* and MEDIUM from Product consumers", () => {
  const held = presentWorkOrder({
    status: "WAITING_ON_VENDOR",
    holdReason: null,
    priority: "MEDIUM",
    workOrderKind: "CORRECTIVE",
    repairTrade: "PLUMBING",
  });
  assert.equal(held.status, "ON_HOLD");
  assert.equal(held.holdReason, "WAITING_FOR_VENDOR");
  assert.equal(held.priority, "ROUTINE");
  assert.equal(held.categoryKey, "PLUMBING");
});
