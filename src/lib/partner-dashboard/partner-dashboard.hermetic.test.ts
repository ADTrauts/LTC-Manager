import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import { partnerAssetWhere } from "@/lib/asset-operations/partner-asset-where";
import { loadPartnerDashboard } from "@/lib/partner-dashboard/load-partner-dashboard";
import {
  summarizeDashboardAssets,
  summarizeDashboardLogs,
  summarizeDashboardReview,
} from "@/lib/partner-dashboard/summarize-partner-dashboard";
import { canPartner } from "@/lib/partner-user-access";
import type { PartnerOperationalContext } from "@/lib/partner-operational-context";
import type { OperationalReviewDayPresentation } from "@/lib/operational-review/present-operational-review-day";
import type { LogRequirementProductState } from "@/lib/logs-architecture/types";

const NOW = new Date("2026-10-09T15:00:00.000Z");

type AssetRow = {
  facilityId: string;
  departmentId: string | null;
  status: "ACTIVE" | "OPERATIONAL" | "DEGRADED" | "OUT_OF_SERVICE" | "RETIRED";
};

function context(partial: Partial<PartnerOperationalContext> = {}): PartnerOperationalContext {
  return {
    accessKind: "partner",
    userId: "user",
    facilityId: "terrace",
    partnerOrganizationId: "metz",
    facilityPartnerOrganizationId: "terrace-metz",
    assignedRole: "PARTNER_VIEWER",
    facilityRoleCeiling: "PARTNER_MANAGER",
    effectiveRole: "PARTNER_VIEWER",
    allowedDepartmentIds: ["food", "evs"],
    activeDepartmentId: "food",
    ...partial,
  };
}

function review(input: {
  serviceDate?: string;
  summaryItems?: OperationalReviewDayPresentation["summaryItems"];
  unavailable?: boolean;
}): OperationalReviewDayPresentation {
  return {
    serviceDate: input.serviceDate ?? "2026-10-09",
    summaryItems: input.summaryItems ?? [],
    evidence: {
      availability: {
        status: input.unavailable ? "unavailable" : "evaluated",
        reason: input.unavailable ? "legacy_only_date" : null,
      },
      unavailableMessage: input.unavailable ? "Historical expectation unavailable for this date." : null,
      attention: [],
      completed: [],
    },
  } as unknown as OperationalReviewDayPresentation;
}

function requirement(productState: LogRequirementProductState, stateLabel: string): RunLogRequirementView {
  return { productState, stateLabel } as RunLogRequirementView;
}

function assetClient(rows: AssetRow[]) {
  return {
    facility: {
      findUnique: async () => ({ timezone: "America/New_York" }),
    },
    asset: {
      groupBy: async (args: {
        where: { departmentId: string; status: { not: string }; unit: { facilityId: string } };
      }) => {
        const where = args.where;
        assert.equal("OR" in where, false);
        const matched = rows.filter(
          (row) =>
            row.departmentId === where.departmentId &&
            row.status !== where.status.not &&
            row.facilityId === where.unit.facilityId,
        );
        const counts = new Map<string, number>();
        for (const row of matched) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        return [...counts].map(([status, count]) => ({ status, _count: { id: count } }));
      },
    },
  };
}

const assets: AssetRow[] = [
  { facilityId: "terrace", departmentId: "food", status: "ACTIVE" },
  { facilityId: "terrace", departmentId: "food", status: "OPERATIONAL" },
  { facilityId: "terrace", departmentId: "food", status: "DEGRADED" },
  { facilityId: "terrace", departmentId: "food", status: "OUT_OF_SERVICE" },
  { facilityId: "terrace", departmentId: "food", status: "RETIRED" },
  { facilityId: "terrace", departmentId: null, status: "OPERATIONAL" },
  { facilityId: "terrace", departmentId: "evs", status: "OUT_OF_SERVICE" },
  { facilityId: "highpointe", departmentId: "food", status: "OPERATIONAL" },
];

function readsFor(calls: { facilityId: string; departmentId: string }[]) {
  return {
    review: async (input: { facilityId: string; departmentId: string; serviceDate: string }) => {
      calls.push(input);
      assert.equal(input.serviceDate, "2026-10-09");
      if (input.facilityId === "terrace" && input.departmentId === "food") {
        return review({
          summaryItems: [
            { id: "evidence-missed", name: "Evidence missed", label: "2 evidence items missed", count: 2 },
            { id: "coverage-gaps", name: "Coverage gaps", label: "4 coverage gaps", count: 4 },
            { id: "assets", name: "Asset impacts", label: "1 asset operational impact", count: 1 },
            { id: "service-late", name: "Late service milestones", label: "1 late", count: 1 },
          ],
        });
      }
      if (input.facilityId === "terrace" && input.departmentId === "evs") {
        return review({
          summaryItems: [
            { id: "evidence-corrective", name: "Corrective actions", label: "1 completed with corrective action", count: 1 },
          ],
        });
      }
      return review({
        summaryItems: [
          { id: "evidence-missed", name: "Evidence missed", label: "9 evidence items missed", count: 9 },
        ],
      });
    },
    logs: async (input: { facilityId: string; departmentId: string }) => {
      calls.push(input);
      if (input.facilityId === "terrace" && input.departmentId === "food") {
        return [
          requirement("DUE", "Due"),
          requirement("DUE", "Due"),
          requirement("OVERDUE", "Overdue"),
          requirement("NOT_APPLICABLE", "Not applicable"),
          requirement("NEEDS_SETUP", "Needs setup"),
        ];
      }
      if (input.facilityId === "terrace" && input.departmentId === "evs") {
        return [requirement("COMPLETED", "Completed"), requirement("UPCOMING", "Upcoming")];
      }
      return [requirement("OVERDUE", "Overdue"), requirement("OVERDUE", "Overdue")];
    },
  };
}

test("partner dashboard capabilities stay on the underlying reads", () => {
  for (const role of ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER"] as const) {
    assert.equal(canPartner(role, "review.read"), true);
    assert.equal(canPartner(role, "logs.read"), true);
    assert.equal(canPartner(role, "assets.read"), true);
  }
  const source = readFileSync(join(process.cwd(), "src/lib/partner-user-access/capabilities.ts"), "utf8");
  assert.equal(source.includes("dashboard.read"), false);
});

test("food dashboard keeps evs and highpointe facts out of every card", async () => {
  const calls: { facilityId: string; departmentId: string }[] = [];
  const view = await loadPartnerDashboard({
    client: assetClient(assets) as never,
    context: context(),
    departmentName: "Food & Nutrition",
    now: NOW,
    reads: readsFor(calls),
  });

  assert.equal(view.serviceDate, "2026-10-09");
  assert.deepEqual(
    view.review?.lines.map((line) => [line.label, line.count]),
    [["Evidence missed", 2]],
  );
  assert.equal(view.review?.href, "/partner/reports?date=2026-10-09");
  assert.deepEqual(
    view.logs?.lines.map((line) => [line.label, line.count]),
    [
      ["Due", 2],
      ["Overdue", 1],
      ["Needs setup", 1],
    ],
  );
  assert.equal(view.logs?.href, "/partner/logs");
  assert.deepEqual(
    view.assets?.lines.map((line) => [line.label, line.count]),
    [
      ["Operational", 2],
      ["Degraded", 1],
      ["Out of service", 1],
    ],
  );
  assert.equal(view.assets?.total, 4);
  assert.equal(view.assets?.href, "/partner/assets");
  assert.deepEqual(
    calls.map((call) => ({ facilityId: call.facilityId, departmentId: call.departmentId })),
    [
      { facilityId: "terrace", departmentId: "food" },
      { facilityId: "terrace", departmentId: "food" },
    ],
  );
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes("Coverage"), false);
  assert.equal(serialized.includes("Asset impacts"), false);
  assert.equal(serialized.includes("Late service"), false);
  assert.equal(serialized.includes("Not applicable"), false);
  assert.equal("exceptions" in view, false);
});

test("department switch replaces food summaries with evs summaries", async () => {
  const food = await loadPartnerDashboard({
    client: assetClient(assets) as never,
    context: context(),
    departmentName: "Food & Nutrition",
    now: NOW,
    reads: readsFor([]),
  });
  const evs = await loadPartnerDashboard({
    client: assetClient(assets) as never,
    context: context({ activeDepartmentId: "evs" }),
    departmentName: "EVS",
    now: NOW,
    reads: readsFor([]),
  });
  assert.equal(JSON.stringify(evs).includes("Evidence missed"), false);
  assert.equal(JSON.stringify(evs).includes("Due"), false);
  assert.deepEqual(evs.review?.lines.map((line) => line.count), [1]);
  assert.deepEqual(evs.logs?.lines.map((line) => line.label), ["Upcoming", "Completed"]);
  assert.deepEqual(evs.assets?.lines.map((line) => [line.label, line.count]), [["Out of service", 1]]);
  assert.equal(evs.assets?.total, 1);
  assert.equal(JSON.stringify(food).includes("Corrective actions"), false);
});

test("removing the active department leaves no previous dashboard numbers", async () => {
  const evs = await loadPartnerDashboard({
    client: assetClient(assets) as never,
    context: context({ activeDepartmentId: "evs", allowedDepartmentIds: ["food", "evs"] }),
    departmentName: "EVS",
    now: NOW,
    reads: readsFor([]),
  });
  const food = await loadPartnerDashboard({
    client: assetClient(assets) as never,
    context: context({ activeDepartmentId: "food", allowedDepartmentIds: ["food"] }),
    departmentName: "Food & Nutrition",
    now: NOW,
    reads: readsFor([]),
  });
  assert.equal(evs.assets?.total, 1);
  assert.equal(food.review?.lines[0]?.label, "Evidence missed");
  assert.equal(JSON.stringify(food).includes("Corrective actions"), false);
});

test("quiet review, empty logs, and empty assets stay factual", () => {
  const quiet = summarizeDashboardReview(
    review({
      summaryItems: [{ id: "coverage-gaps", name: "Coverage gaps", label: "1 coverage gap", count: 1 }],
    }),
  );
  assert.equal(quiet.quietMessage, "No evidence exceptions for this service day.");
  assert.equal(quiet.lines.length, 0);
  assert.equal(JSON.stringify(quiet).includes("100%"), false);

  const unavailable = summarizeDashboardReview(review({ unavailable: true }));
  assert.match(unavailable.unavailableMessage ?? "", /Historical expectation unavailable/);
  assert.equal(unavailable.quietMessage, null);

  const logs = summarizeDashboardLogs([]);
  assert.equal(logs.emptyMessage, "No log requirements for this service day.");
  assert.equal(JSON.stringify(logs).includes("All complete"), false);

  const assetCard = summarizeDashboardAssets([], "Food & Nutrition");
  assert.equal(assetCard.emptyMessage, "No assets assigned to Food & Nutrition.");
  assert.equal(assetCard.total, 0);
});

test("a domain read failure rejects the dashboard", async () => {
  await assert.rejects(
    () =>
      loadPartnerDashboard({
        client: assetClient(assets) as never,
        context: context(),
        departmentName: "Food & Nutrition",
        now: NOW,
        reads: {
          review: async () => {
            throw new Error("review read failed");
          },
          logs: async () => [],
        },
      }),
    /review read failed/,
  );
});

test("partner asset scope stays exact and dashboard links stay on partner routes", () => {
  const where = partnerAssetWhere({ facilityId: "terrace", departmentId: "food" });
  assert.deepEqual(where, {
    departmentId: "food",
    status: { not: "RETIRED" },
    unit: { facilityId: "terrace" },
  });
  assert.throws(() => partnerAssetWhere({ facilityId: "terrace", departmentId: " " }), /one Department/);

  const dashboard = readFileSync(join(process.cwd(), "src/components/partner/partner-dashboard.tsx"), "utf8");
  const loader = readFileSync(join(process.cwd(), "src/lib/partner-dashboard/load-partner-dashboard.ts"), "utf8");
  const shell = readFileSync(join(process.cwd(), "src/components/partner/partner-facility-shell.tsx"), "utf8");
  const assetsLoader = readFileSync(join(process.cwd(), "src/lib/asset-operations/load-partner-assets.ts"), "utf8");
  assert.match(shell, />\s*Dashboard\s*</);
  assert.equal(shell.includes("Partner Home"), false);
  assert.equal(shell.includes("Operational screens will become available"), false);
  assert.match(assetsLoader, /partnerAssetWhere/);
  assert.match(loader, /partnerAssetWhere/);
  assert.match(loader, /loadPartnerOperationalReview/);
  assert.match(loader, /loadPartnerRunLogRequirements/);
  assert.match(loader, /Promise\.all/);
  for (const forbidden of [
    "/workspace",
    "/reports",
    "/staffing/logs",
    'href="/assets"',
    "/units",
    "assetResponsibleDepartmentWhere",
    "assetIssue",
    "DepartmentWork",
    "employee",
  ]) {
    assert.equal(loader.includes(forbidden), false, forbidden);
    assert.equal(dashboard.includes(forbidden), false, forbidden);
  }
});
