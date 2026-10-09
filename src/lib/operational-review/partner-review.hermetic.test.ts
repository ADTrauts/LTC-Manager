import assert from "node:assert/strict";
import test from "node:test";

import { canPartner } from "@/lib/partner-user-access";
import { partnerShellReturnPath } from "@/lib/partner-operational-context";
import { loadOperationalReviewRangeFacts } from "@/lib/operational-review/load-operational-review-range-facts";
import { operationalReviewSpaceWhere } from "@/lib/operational-review/review-space-scope";
import { loadPartnerOperationalReview } from "@/lib/operational-review/load-partner-operational-review";
import { composeOperationalReviewDay } from "@/lib/operational-review/compose-operational-review-day";
import { composeOperationalReviewRange } from "@/lib/operational-review/compose-operational-review-range";

test("partner Review capability is explicit and read-only", () => {
  for (const role of ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER"] as const) {
    assert.equal(canPartner(role, "review.read"), true);
  }
  assert.equal(partnerShellReturnPath("/partner/reports"), "/partner/reports");
  assert.equal(partnerShellReturnPath("https://evil.example/partner/reports"), "/partner");
  assert.equal(partnerShellReturnPath("/reports"), "/partner");
});

test("Department Review spaces use responsibility, not every Facility room", () => {
  const scoped = operationalReviewSpaceWhere("terrace", "food");
  assert.equal(scoped.facilityId, "terrace");
  assert.deepEqual(scoped.responsibilities, { some: { departmentId: "food" } });
  const all = operationalReviewSpaceWhere("terrace", null);
  assert.equal("responsibilities" in all, false);
});

test("partner Review fact load requires a Department and scopes queries", async () => {
  const calls: string[] = [];
  const client = new Proxy(
    {},
    {
      get(_target, model: string) {
        return {
          findUnique: async () => ({ id: "terrace", timezone: "America/New_York" }),
          findFirst: async () =>
            model === "facility"
              ? { id: "terrace", displayName: "Terrace View", timezone: "America/New_York" }
              : null,
          findMany: async (args?: { where?: Record<string, unknown> }) => {
            calls.push(`${model}:${JSON.stringify(args?.where ?? {})}`);
            if (model === "department") {
              return [{ id: "food", name: "Food & Nutrition" }];
            }
            if (model === "unitSpace") {
              const where = JSON.stringify(args?.where ?? {});
              assert.match(where, /terrace/);
              assert.match(where, /food/);
              assert.match(where, /responsibilities/);
              return [{ id: "servery", name: "Servery A", unitId: "n1", unit: { id: "n1", name: "1A" } }];
            }
            return [];
          },
          count: async () => 0,
        };
      },
    },
  );

  await assert.rejects(
    () =>
      loadOperationalReviewRangeFacts({
        client: client as never,
        facilityId: "terrace",
        startServiceDate: "2026-10-09",
        endServiceDate: "2026-10-09",
        keys: ["2026-10-09"],
        omitFacilityWideFacts: true,
      }),
    /requires one Department/,
  );

  calls.length = 0;
  const loaded = await loadOperationalReviewRangeFacts({
    client: client as never,
    facilityId: "terrace",
    departmentId: "food",
    startServiceDate: "2026-10-09",
    endServiceDate: "2026-10-09",
    keys: ["2026-10-09"],
    omitFacilityWideFacts: true,
    now: new Date("2026-10-09T16:00:00.000Z"),
  });
  const facts = loaded.factsByDate.get("2026-10-09");
  assert.ok(facts);
  assert.deepEqual(
    facts.spaces.map((space) => space.displayLabel),
    ["Servery A"],
  );
  assert.equal(calls.some((call) => call.startsWith("assignmentOverride:")), false);
  assert.equal(calls.some((call) => call.startsWith("serveryMealServiceEvent:")), false);
  assert.equal(calls.some((call) => call.startsWith("logSubmission:")), false);
  const evidence = calls.find((call) => call.startsWith("operationalEvidenceRecord:"));
  assert.match(evidence ?? "", /terrace/);
  assert.match(evidence ?? "", /food/);
});

test("range aggregation uses only the composed Department days", () => {
  const food = composeOperationalReviewDay({
    facilityId: "terrace",
    facilityLabel: "Terrace View",
    departmentId: "food",
    departmentIds: ["food"],
    serviceDate: "2026-10-09",
    timezone: "America/New_York",
    now: new Date("2026-10-09T16:00:00.000Z"),
    todayKey: "2026-10-09",
    spaces: [
      {
        spaceId: "servery",
        displayLabel: "Servery A",
        parentUnitId: "n1",
        parentUnitLabel: "1A",
      },
    ],
    profiles: [],
    otBindings: [],
    attachmentSegments: [],
    evidenceRecords: [],
    coverageTemplates: [],
    assignments: [],
    plans: [],
    cycles: [],
    publishedCyclesForLogs: [],
    serveryMilestoneActuals: [],
    keyTimeActuals: [],
    scheduledPresence: [],
    presenceExceptions: [],
    assetImpacts: [],
    legacySubmissionPresent: false,
  });
  assert.equal(food.locations.some((row) => row.displayLabel === "Resident Room 101"), false);
  const range = composeOperationalReviewRange({
    days: [food],
    startServiceDate: "2026-10-09",
    endServiceDate: "2026-10-09",
    todayKey: "2026-10-09",
  });
  assert.equal(range.days.length, 1);
  assert.equal(range.days[0]?.departmentId, "food");
});

test("partner Review loader refuses a null Department", async () => {
  await assert.rejects(
    () =>
      loadPartnerOperationalReview({
        client: {} as never,
        facilityId: "terrace",
        departmentId: "  ",
        date: "2026-10-09",
      }),
    /requires one Department/,
  );
});
