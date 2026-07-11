import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveEvsRoomAreaSignals,
  emptyEvsRoomAreaSignals,
  groupEvsRoomAreaSignalsByUnit,
} from "@/lib/readiness/evs-room-signals";

test("deriveEvsRoomAreaSignals maps CLEAN to complete", () => {
  const signals = deriveEvsRoomAreaSignals({
    unitId: "u1",
    status: "CLEAN",
    updatedAt: new Date("2026-07-08T10:00:00Z"),
  });
  assert.equal(signals.evsRoomServiceComplete, true);
  assert.equal(signals.evsCriticalRoomCondition, false);
  assert.equal(signals.evsActiveCleaning, false);
});

test("deriveEvsRoomAreaSignals maps ISOLATION to critical", () => {
  const signals = deriveEvsRoomAreaSignals({ unitId: "u1", status: "ISOLATION" });
  assert.equal(signals.evsCriticalRoomCondition, true);
  assert.equal(signals.evsRoomStatus, "ISOLATION");
});

test("empty / missing room status stays conservative", () => {
  assert.deepEqual(deriveEvsRoomAreaSignals(null), emptyEvsRoomAreaSignals());
  assert.equal(deriveEvsRoomAreaSignals(undefined).evsRoomStatusPresent, false);
});

test("groupEvsRoomAreaSignalsByUnit batches by unit id", () => {
  const map = groupEvsRoomAreaSignalsByUnit([
    { unitId: "a", status: "DIRTY" },
    { unitId: "b", status: "DISCHARGE" },
  ]);
  assert.equal(map.get("a")?.evsActiveCleaning, true);
  assert.equal(map.get("b")?.evsDischargePending, true);
});
