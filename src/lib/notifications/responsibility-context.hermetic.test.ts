/**
 * Responsibility scope comes from the thread, not from a recipient row.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { coverageAttentionThreadKey } from "./thread-key";
import { loadResponsibilityContext } from "./responsibility-context";
import {
  RESPONSIBILITY_RECONCILIATION_MAX_PAGES,
  RESPONSIBILITY_RECONCILIATION_PAGE,
  evaluateResponsibilityReconciliation,
  userHoldsPrimaryReason,
} from "./responsibility-reconciliation";

test("coverage scope is the thread grain, including when nobody was notified", async () => {
  const sourceId = coverageAttentionThreadKey({
    kind: "coverage",
    facilityId: "fac",
    serviceDate: "2026-10-29",
    departmentId: "dept",
    spaceId: "space",
    responsibility: "SERVER",
    cycleStableKey: "breakfast",
    episodeId: "episode",
  });
  const loaded = await loadResponsibilityContext({} as PrismaClient, {
    facilityId: "fac",
    departmentId: "dept",
    sourceType: "coverage_responsibility",
    sourceId,
    metadata: {
      protected: false,
      responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" },
    },
  });
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.context.spaceId, "space");
  assert.equal(loaded.context.serviceDate, "2026-10-29");
  assert.equal(loaded.context.primaryReason, "ON_DUTY_SUPERVISOR");
  assert.equal(loaded.context.departmentId, "dept");
});

test("the scan stops after its page cap", async () => {
  let pages = 0;
  const db = {
    notification: {
      findMany: async (args: { distinct?: string[]; cursor?: { id: string }; take?: number }) => {
        if (args.distinct) return [{ facilityId: "fac" }];
        pages += 1;
        assert.equal(args.take, RESPONSIBILITY_RECONCILIATION_PAGE);
        if (pages > 1) assert.ok(args.cursor?.id);
        return Array.from({ length: RESPONSIBILITY_RECONCILIATION_PAGE }, (_, index) => ({
          id: `page-${pages}-${index}`,
          facilityId: "fac",
          departmentId: "dept",
          kind: "OPERATIONAL",
          priority: "NEEDS_ATTENTION",
          requiresAcknowledgement: true,
          sourceType: "asset_status",
          sourceId: "[]",
          metadata: { protected: false },
        }));
      },
    },
  };
  const result = await evaluateResponsibilityReconciliation({
    db: db as never,
    now: new Date("2026-10-29T23:05:00.000Z"),
  });
  assert.equal(pages, RESPONSIBILITY_RECONCILIATION_MAX_PAGES * 9);
  assert.equal(result.facilitiesScanned, 1);
  assert.equal(result.candidates, 0);
  assert.equal(result.transitions, 0);
  assert.equal(RESPONSIBILITY_RECONCILIATION_PAGE * RESPONSIBILITY_RECONCILIATION_MAX_PAGES, 500);
});

test("a different recipient reason does not count as current primary duty", () => {
  assert.equal(
    userHoldsPrimaryReason(
      [{ userId: "user", reason: "DEPARTMENT_MANAGER" }],
      "user",
      "ON_CALL_RESPONDER",
    ),
    false,
  );
  assert.equal(
    userHoldsPrimaryReason(
      [{ userId: "user", reason: "ON_CALL_RESPONDER" }],
      "user",
      "ON_CALL_RESPONDER",
    ),
    true,
  );
});

test("a thread with no stored responsibility reason is not guessed", async () => {
  const loaded = await loadResponsibilityContext({} as PrismaClient, {
    facilityId: "fac",
    departmentId: "dept",
    sourceType: "asset_status",
    sourceId: JSON.stringify(["asset_out_of_service", "fac", "asset", "history"]),
    metadata: { protected: false },
  });
  assert.deepEqual(loaded, { ok: false, cause: "responsibility_context_missing" });
});
