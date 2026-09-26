/**
 * Phase 6N — Supervisor Board evidence attention (pure).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { emptyLocationProgram } from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";

import {
  presentSupervisorEvidenceAttention,
  type SupervisorHistoricalEvidenceRecord,
} from "./supervisor-evidence-attention";

function evidenceItem(
  partial: Partial<RuntimeLocationState["evidence"]["items"][number]> & {
    requirementKey: string;
    displayName: string;
    productState: RuntimeLocationState["evidence"]["items"][number]["productState"];
  },
): RuntimeLocationState["evidence"]["items"][number] {
  return {
    requirementKey: partial.requirementKey,
    attachmentId: partial.attachmentId ?? `att-${partial.requirementKey}`,
    catalogStableKey: partial.catalogStableKey ?? "food_temperature_log",
    displayName: partial.displayName,
    productState: partial.productState,
    cycleStableKey: "breakfast",
    window: { start: "08:00", end: "09:00" },
    recordId: partial.recordId ?? null,
    href: partial.href ?? (partial.recordId ? `/staffing/logs/records/${partial.recordId}` : null),
    needsSupervisorReview: partial.needsSupervisorReview ?? false,
  };
}

function state(partial: {
  spaceId: string;
  name?: string;
  unitId?: string;
  departmentId?: string;
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
}): RuntimeLocationState {
  const items = partial.evidenceItems ?? [];
  return withRuntimeLocationAnswers({
    identity: {
      location: {
        kind: "SPACE",
        spaceId: partial.spaceId,
        unitId: partial.unitId ?? "unit-a",
        departmentId: partial.departmentId ?? "dept-1",
        facilityId: "fac-1",
      },
      displayName: partial.name ?? partial.spaceId,
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "Floor 3",
        neighborhoodName: "3A",
        unitName: "3A",
        spaceName: partial.name ?? partial.spaceId,
      },
      physical: { roomTypeKey: null, roomTypeLabel: null },
    },
    program: {
      locationProgram: emptyLocationProgram({
        departmentId: partial.departmentId ?? "dept-1",
        departmentName: "Dietary",
        spaceId: partial.spaceId,
        name: partial.name ?? partial.spaceId,
      }),
      operationalType: {
        state: "assigned",
        key: "SERVERY",
        name: "Servery",
        id: "ot",
        profileId: "p1",
        profileVersion: 1,
        profileStatus: "ACTIVE",
      },
      cycleSetRef: null,
      coverageExpectationRefs: [],
      logAttachmentRefs: [],
    },
    operation: { state: "NONE", current: null, upcoming: null, provenance: "NEW_PERIOD_KEY_TIME" },
    coverage: { availability: "evaluated", planLifecycle: "RUNTIME_VISIBLE", slots: [] },
    evidence: {
      requiredToday: items.length,
      dueNow: [],
      upcoming: [],
      completed: [],
      overdue: items.filter((row) => row.productState === "OVERDUE").map((row) => row.requirementKey),
      needsReview: items.filter((row) => row.needsSupervisorReview).map((row) => row.requirementKey),
      correctiveOpen: items
        .filter((row) => row.productState === "COMPLETED_WITH_EXCEPTION")
        .map((row) => row.requirementKey),
      items,
    },
    assets: { assets: [], openIssues: [], issuesAffectingOperation: [] },
    milestones: { items: [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: [],
    next: null,
    asOf: {
      now: new Date("2026-08-17T11:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  });
}

function history(
  partial: Partial<SupervisorHistoricalEvidenceRecord> & Pick<SupervisorHistoricalEvidenceRecord, "id" | "templateName">,
): SupervisorHistoricalEvidenceRecord {
  return {
    id: partial.id,
    unitId: partial.unitId ?? "unit-a",
    spaceId: partial.spaceId ?? null,
    templateName: partial.templateName,
    status: partial.status ?? "NEEDS_REVIEW",
    outOfStandard: partial.outOfStandard ?? false,
    correctiveActionText: partial.correctiveActionText ?? null,
    logAttachmentId: partial.logAttachmentId ?? null,
    logRequirementKey: partial.logRequirementKey ?? null,
    requirementKey: partial.requirementKey ?? partial.id,
  };
}

const units = new Map([["unit-a", "3A"]]);

test("Harbor on: overdue Food Temperature keeps SPACE identity and canonical link", () => {
  const items = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: true,
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [
          evidenceItem({
            requirementKey: "H-food",
            displayName: "Food Temperature",
            productState: "OVERDUE",
          }),
        ],
      }),
    ],
    historicalRecords: [],
    unitNameById: units,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.kind, "current");
  assert.equal(items[0]?.status, "Food Temperature overdue");
  assert.equal(items[0]?.locationLabel, "3A Servery");
  assert.equal(items[0]?.spaceId, "servery-a");
  assert.equal(items[0]?.unitId, "unit-a");
  assert.match(items[0]?.sourceHref ?? "", /\/unit\/unit-a\?space=servery-a#evidence/);
  assert.equal((items[0]?.sourceHref ?? "").includes("/staffing/templates"), false);
});

test("Harbor on: needs review and completed-with-exception become current attention", () => {
  const items = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: true,
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [
          evidenceItem({
            requirementKey: "H-review",
            displayName: "Cooler Temperature",
            productState: "COMPLETED",
            recordId: "rec-review",
            needsSupervisorReview: true,
          }),
          evidenceItem({
            requirementKey: "H-exc",
            displayName: "Dishwasher",
            productState: "COMPLETED_WITH_EXCEPTION",
            recordId: "rec-exc",
          }),
        ],
      }),
    ],
    historicalRecords: [],
    unitNameById: units,
  });
  assert.deepEqual(
    items.map((row) => row.status),
    ["Cooler Temperature needs review", "Dishwasher completed with exception"],
  );
  assert.equal(items.every((row) => row.kind === "current"), true);
});

test("Harbor on: historical template review remains visible and is not Harbor-converted", () => {
  const items = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: true,
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [
          evidenceItem({
            requirementKey: "H-food",
            displayName: "Food Temperature",
            productState: "OVERDUE",
          }),
        ],
      }),
    ],
    historicalRecords: [
      history({
        id: "tpl-review",
        templateName: "Cooler Temperature Log",
        status: "NEEDS_REVIEW",
        requirementKey: "tmpl_123|OPERATIONAL_CYCLE",
      }),
    ],
    unitNameById: units,
  });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.kind, "current");
  assert.equal(items[1]?.kind, "historical");
  assert.equal(items[1]?.status, "Needs review — Cooler Temperature Log");
  assert.equal(items[1]?.sourceHref, "/staffing/log-book/tpl-review");
  assert.equal(items[1]?.requirementKey, "tmpl_123|OPERATIONAL_CYCLE");
});

test("Harbor off: RLS current dues are ignored; historical review remains", () => {
  const items = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: false,
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [
          evidenceItem({
            requirementKey: "H-food",
            displayName: "Food Temperature",
            productState: "OVERDUE",
          }),
        ],
      }),
    ],
    historicalRecords: [
      history({
        id: "hist-1",
        templateName: "Opening Checklist",
        status: "NEEDS_REVIEW",
      }),
    ],
    unitNameById: units,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.kind, "historical");
  assert.equal(items[0]?.status, "Needs review — Opening Checklist");
});

test("no current evidence and no historical review is quiet", () => {
  const items = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: true,
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [
          evidenceItem({
            requirementKey: "H-ok",
            displayName: "Food Temperature",
            productState: "COMPLETED",
          }),
        ],
      }),
    ],
    historicalRecords: [],
    unitNameById: units,
  });
  assert.deepEqual(items, []);
});

test("same Harbor record is not double-rendered as current and historical", () => {
  const items = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: true,
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [
          evidenceItem({
            requirementKey: "H-exc",
            displayName: "Food Temperature",
            productState: "COMPLETED_WITH_EXCEPTION",
            recordId: "rec-same",
            needsSupervisorReview: true,
          }),
        ],
      }),
    ],
    historicalRecords: [
      history({
        id: "rec-same",
        templateName: "Food Temperature",
        status: "COMPLETED_WITH_CORRECTIVE_ACTION",
        correctiveActionText: "Discarded",
        logRequirementKey: "H-exc",
      }),
    ],
    unitNameById: units,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.kind, "current");
  assert.equal(items[0]?.status, "Food Temperature needs review");
});

test("legacy template history is not suppressed when Harbor has no matching record", () => {
  const items = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: true,
    states: [
      state({
        spaceId: "other",
        name: "Retail",
        evidenceItems: [
          evidenceItem({
            requirementKey: "H-food",
            displayName: "Food Temperature",
            productState: "OVERDUE",
          }),
        ],
      }),
    ],
    historicalRecords: [
      history({
        id: "legacy-1",
        templateName: "tmpl cooler",
        status: "NEEDS_REVIEW",
        requirementKey: "tmpl_abc",
      }),
    ],
    unitNameById: units,
  });
  assert.equal(items.some((row) => row.recordId === "legacy-1"), true);
});

test("only department states passed in are presented (scope is caller-owned)", () => {
  const items = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: true,
    states: [
      state({
        spaceId: "dept-space",
        name: "Dietary Servery",
        departmentId: "dept-1",
        evidenceItems: [
          evidenceItem({
            requirementKey: "H-1",
            displayName: "Food Temperature",
            productState: "OVERDUE",
          }),
        ],
      }),
    ],
    historicalRecords: [],
    unitNameById: units,
  });
  assert.equal(items.every((row) => row.spaceId === "dept-space"), true);
});

test("Board loader no longer treats Operational Templates as current Run truth", () => {
  const root = process.cwd();
  const boardLoad = [
    readFileSync(join(root, "src/lib/dietary-job-flow/load-supervisor-operations-board.ts"), "utf8"),
    readFileSync(
      join(root, "src/lib/dietary-job-flow/supervisor-operations/load-facts.ts"),
      "utf8",
    ),
    readFileSync(join(root, "src/lib/dietary-job-flow/supervisor-operations/compose.ts"), "utf8"),
  ].join("\n");
  const page = readFileSync(join(root, "src/app/(protected)/staffing/operations/page.tsx"), "utf8");
  assert.equal(boardLoad.includes("operationalTemplate.count"), false);
  assert.equal(boardLoad.includes("Missing Template configuration"), false);
  assert.equal(boardLoad.includes("resolveUnitEvidenceRequirements"), false);
  assert.match(boardLoad, /isCanonicalLogsEnabled/);
  assert.match(boardLoad, /loadRuntimeLocationStates/);
  assert.match(boardLoad, /presentSupervisorEvidenceAttention/);
  assert.match(page, /loadSupervisorOperationsViewModel/);
  assert.equal(page.includes("Missing Template configuration"), false);
  assert.equal(boardLoad.includes("No active log requirements configured"), false);
  assert.match(boardLoad, /responsibilities:\s*\{\s*some:\s*\{\s*departmentId: input\.departmentId/);
  assert.match(page, /authMethod === "QUICK_PIN"/);
  assert.equal(page.includes("GROUP_ORDER"), false);
  assert.equal(page.includes("Unassigned:"), false);
});
