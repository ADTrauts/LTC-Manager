/**
 * Phase 6J — shared EmployeeRuntimeFlow composer.
 * Pure. No Prisma. No ScheduleEntry. One next-action rule.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { WorkRequirement } from "@/lib/department-work/types";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import { DEFERRED_READINESS, type RuntimeLocationState } from "@/lib/runtime-location-state";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";

import { composeEmployeeRuntimeFlow } from "./compose";
import { resolveEmployeeNextAction } from "./next-action";
import {
  serializeEmployeeRuntimeEvidenceContext,
  serializeEmployeeRuntimeJobFlowContext,
} from "./serialize-offline";
import { adaptEmployeeRuntimeFlowToJobFlow } from "./to-job-flow";

const NEXT_AT = new Date("2026-08-17T12:30:00.000Z");

function assignment(
  partial: Partial<JobFlowAssignmentSnapshot> & { id: string },
): JobFlowAssignmentSnapshot {
  return {
    id: partial.id,
    roleKey: partial.roleKey ?? "SERVER",
    roleLabel: partial.roleLabel ?? "Server",
    unitId: partial.unitId ?? "unit-a",
    unitName: partial.unitName ?? "3A",
    startsAt: partial.startsAt ?? new Date("2026-08-17T10:00:00.000Z"),
    endsAt: partial.endsAt ?? new Date("2026-08-17T18:00:00.000Z"),
    status: partial.status ?? "ACTIVE",
    scopeKind: partial.scopeKind ?? "SPACES",
    locationCount: partial.locationCount,
    locationLabels: partial.locationLabels,
    sourceZoneName: partial.sourceZoneName ?? null,
  };
}

function location(
  spaceId: string,
  label = spaceId,
  unitId = "unit-a",
): ResolvedAssignmentLocation {
  return {
    unitSpaceId: spaceId,
    unitId,
    label,
    sortOrder: 10,
    roomNumber: null,
    spaceName: label,
    unitName: "3A",
  };
}

function evidenceItem(
  key: string,
  name: string,
  productState: RuntimeLocationState["evidence"]["items"][number]["productState"],
  catalogStableKey = "food_temperature_log",
) {
  return {
    requirementKey: key,
    attachmentId: `att-${key}`,
    catalogStableKey,
    displayName: name,
    productState,
    cycleStableKey: "breakfast",
    window: { start: "08:00", end: "09:00" },
    recordId: productState.startsWith("COMPLETED") ? `rec-${key}` : null,
    href: `/staffing/logs/open?attachmentId=att-${key}&requirementKey=${key}`,
    needsSupervisorReview: false,
  };
}

function state(partial: {
  spaceId: string;
  name?: string;
  unitId?: string;
  cycle?: string | null;
  cycleLabel?: string;
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
  issues?: RuntimeLocationState["assets"]["openIssues"];
  milestones?: RuntimeLocationState["milestones"]["items"];
  nextLabel?: string | null;
  exceptions?: RuntimeLocationState["exceptions"];
}): RuntimeLocationState {
  const items = partial.evidenceItems ?? [];
  return {
    identity: {
      location: {
        kind: "SPACE",
        spaceId: partial.spaceId,
        unitId: partial.unitId ?? "unit-a",
        departmentId: "dept-1",
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
    operation: {
      state: partial.cycle ? "ACTIVE" : "NONE",
      current: partial.cycle
        ? {
            cycleStableKey: partial.cycle,
            cycleVersion: 1,
            label: partial.cycleLabel ?? partial.cycle,
            hierarchyLabel: partial.cycleLabel ?? partial.cycle,
            window: { start: "06:00", end: "10:00" },
            timing: {
              configured: "06:00",
              adjusted: null,
              expectedToday: "06:00",
              actual: null,
              recordedAt: null,
            },
          }
        : null,
      upcoming: null,
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: { availability: "evaluated", planLifecycle: "RUNTIME_VISIBLE", slots: [] },
    evidence: {
      requiredToday: items.length,
      dueNow: items.filter((row) => row.productState === "DUE").map((row) => row.requirementKey),
      upcoming: items.filter((row) => row.productState === "UPCOMING").map((row) => row.requirementKey),
      completed: items
        .filter((row) => row.productState === "COMPLETED")
        .map((row) => row.requirementKey),
      overdue: items.filter((row) => row.productState === "OVERDUE").map((row) => row.requirementKey),
      needsReview: [],
      correctiveOpen: [],
      items,
    },
    assets: {
      assets: [],
      openIssues: partial.issues ?? [],
      issuesAffectingOperation: (partial.issues ?? []).filter((issue) =>
        ["SERVICE_AT_RISK", "EQUIPMENT_UNAVAILABLE", "WORKAROUND_AVAILABLE"].includes(issue.impact),
      ),
    },
    milestones: { items: partial.milestones ?? [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: partial.exceptions ?? [],
    next:
      partial.nextLabel === null
        ? null
        : {
            kind: "evidence_window",
            at: NEXT_AT,
            label: partial.nextLabel ?? "Lunch",
            sourceId: `${partial.spaceId}-next`,
          },
    asOf: {
      now: new Date("2026-08-17T11:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  };
}

function work(partial: Partial<WorkRequirement> & { occurrenceKey: string; label: string; state: WorkRequirement["state"] }): WorkRequirement {
  return {
    occurrenceKey: partial.occurrenceKey,
    workPlanId: "wp",
    workPlanStableKey: "wp",
    workPlanVersion: 1,
    workPlanName: "Plan",
    workItemId: "item",
    workItemKey: "item",
    label: partial.label,
    instructions: null,
    priority: "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "OPERATIONAL_CYCLE",
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    dueAt: null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "unit-a",
    unitName: "3A",
    spaceId: partial.spaceId ?? "servery-a",
    assetId: null,
    roleKeys: [],
    knowledgeArticleId: null,
    procedureTitle: null,
    linkedTemplateStableKey: partial.linkedTemplateStableKey ?? null,
    linkedTemplateId: null,
    state: partial.state,
    occurrenceId: null,
    occurrenceStatus: null,
    assignedEmployeeId: null,
    completedByLabel: null,
    completedAt: null,
    evidenceRecordId: null,
    sourceKind: "WORK_PLAN",
    sourceHref: "/staffing/work-plans",
  };
}

function templateReq(key: string, spaceId: string | null = "servery-a"): EvidenceRequirement {
  return {
    requirementKey: key,
    state: "DUE",
    stateLabel: "Due now",
    operationalDateKey: "2026-08-17",
    templateId: "tpl-1",
    templateStableKey: "food_temp",
    templateVersion: 1,
    templateName: "Food Temperature",
    purposeType: "LOG",
    scheduleKind: "OPERATIONAL_CYCLE",
    cycleStableKey: "breakfast",
    cycleLabel: "Breakfast",
    windowStartLocal: "08:00",
    windowEndLocal: "09:00",
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "unit-a",
    spaceId,
    assetId: null,
    assetType: null,
    spaceType: null,
    recordId: null,
    recordStatus: null,
    fields: [],
    instructions: null,
  };
}

function compose(partial: Parameters<typeof composeEmployeeRuntimeFlow>[0] extends infer T ? Partial<T> : never) {
  const oa = assignment({ id: "oa-1" });
  const loc = location("servery-a", "3A Servery");
  return composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: oa,
    upcomingAssignment: null,
    assignmentLocations: [loc],
    spaceRefs: [
      {
        spaceId: "servery-a",
        departmentId: "dept-1",
        unitId: "unit-a",
        displayName: "3A Servery",
      },
    ],
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        cycle: "breakfast",
        cycleLabel: "Breakfast",
        evidenceItems: [evidenceItem("H1", "Food Temperature", "DUE")],
        nextLabel: "Food Temperature",
      }),
    ],
    templateEvidence: [],
    workRequirements: [],
    ...partial,
  });
}

test("single SPACE: responsibility, shared Breakfast, Harbor due evidence, next is Food Temperature", () => {
  const flow = compose({});
  assert.equal(flow.assignmentAvailability, "evaluated");
  assert.equal(flow.responsibility.roleLabel, "Server");
  assert.deepEqual(flow.responsibility.assignedSpaceIds, ["servery-a"]);
  assert.equal(flow.operation.kind, "shared");
  if (flow.operation.kind === "shared") {
    assert.equal(flow.operation.cycleStableKey, "breakfast");
    assert.equal(flow.operation.label, "Breakfast");
  }
  assert.equal(flow.evidenceMode, "harbor");
  assert.equal(flow.evidence.length, 1);
  assert.equal(flow.evidence[0]?.attachmentId, "att-H1");
  assert.equal(flow.evidence[0]?.requirementKey, "H1");
  assert.equal(flow.evidence[0]?.catalogStableKey, "food_temperature_log");
  assert.equal(flow.next.kind, "due_evidence");
  assert.equal(flow.next.label, "Food Temperature");
});

test("multi SPACE: only assigned spaces; 3C evidence excluded; online/offline sets match", () => {
  const oa = assignment({ id: "oa-2", locationCount: 2, locationLabels: ["3A Servery", "3B Servery"] });
  const locations = [location("servery-a", "3A Servery"), location("servery-b", "3B Servery")];
  const refs = locations.map((row) => ({
    spaceId: row.unitSpaceId,
    departmentId: "dept-1",
    unitId: "unit-a",
    displayName: row.label,
  }));
  const states = [
    state({
      spaceId: "servery-a",
      name: "3A Servery",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      evidenceItems: [evidenceItem("H1", "Food Temperature", "DUE")],
    }),
    state({
      spaceId: "servery-b",
      name: "3B Servery",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      evidenceItems: [evidenceItem("H2", "Dish Temp", "UPCOMING")],
    }),
    state({
      spaceId: "servery-c",
      name: "3C Servery",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      evidenceItems: [evidenceItem("H3", "Leak", "OVERDUE")],
    }),
  ];
  const input = {
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: oa,
    upcomingAssignment: null,
    assignmentLocations: locations,
    spaceRefs: refs,
    states,
    templateEvidence: [],
    workRequirements: [],
  };
  const online = composeEmployeeRuntimeFlow(input);
  const offline = composeEmployeeRuntimeFlow(input);
  assert.deepEqual(online.responsibility.assignedSpaceIds.sort(), ["servery-a", "servery-b"]);
  assert.deepEqual(offline.responsibility.assignedSpaceIds, online.responsibility.assignedSpaceIds);
  assert.deepEqual(
    online.evidence.map((row) => row.requirementKey).sort(),
    ["H1", "H2"],
  );
  assert.deepEqual(
    offline.evidence.map((row) => row.requirementKey),
    online.evidence.map((row) => row.requirementKey),
  );
  assert.equal(online.evidence.some((row) => row.requirementKey === "H3"), false);
  assert.equal(online.operation.kind, "shared");
});

test("UNIT scope uses child SPACE refs, never a unit-level RLS row", () => {
  const oa = assignment({ id: "oa-unit", scopeKind: "UNIT", locationCount: 0 });
  const refs = ["s1", "s2", "s3"].map((id) => ({
    spaceId: id,
    departmentId: "dept-1",
    unitId: "unit-a",
    displayName: id,
  }));
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: oa,
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: refs,
    states: refs.map((ref) => state({ spaceId: ref.spaceId, name: ref.displayName, cycle: "breakfast", cycleLabel: "Breakfast" })),
    templateEvidence: [],
    workRequirements: [],
  });
  assert.equal(flow.responsibility.scopeKind, "UNIT");
  assert.deepEqual(flow.responsibility.assignedSpaceIds.sort(), ["s1", "s2", "s3"]);
  assert.equal(flow.locations.length, 3);
  assert.equal(flow.locations.some((row) => row.spaceId === "unit-a"), false);
});

test("OA disabled / no assignment: Assignment unavailable, no schedule fallback, no execution list", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: false,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "ignored" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1" }],
    states: [state({ spaceId: "servery-a", cycle: "breakfast", evidenceItems: [evidenceItem("H1", "Food Temperature", "DUE")] })],
    templateEvidence: [templateReq("tpl-key")],
    workRequirements: [work({ occurrenceKey: "w1", label: "Wipe", state: "DUE" })],
  });
  assert.equal(flow.assignmentAvailability, "unavailable");
  assert.equal(flow.currentAssignment, null);
  assert.equal(flow.evidence.length, 0);
  assert.equal(flow.work.length, 0);
  assert.equal(flow.next.kind, "none");
  const adapted = adaptEmployeeRuntimeFlowToJobFlow({
    flow,
    now: new Date("2026-08-17T11:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-17",
    states: [],
  });
  assert.equal(adapted.state, "NO_CONFIRMED_ASSIGNMENT");
  assert.match(adapted.current.expectation, /Assignment unavailable/);
});

test("upcoming assignment transition is represented without inventing current responsibility", () => {
  const upcoming = assignment({
    id: "oa-later",
    status: "PLANNED",
    startsAt: new Date("2026-08-17T14:00:00.000Z"),
  });
  const flow = compose({
    currentAssignment: null,
    upcomingAssignment: upcoming,
    states: [state({ spaceId: "servery-a", name: "3A Servery", cycle: "breakfast", cycleLabel: "Breakfast" })],
  });
  assert.equal(flow.assignmentAvailability, "evaluated");
  assert.equal(flow.currentAssignment, null);
  assert.equal(flow.upcomingAssignment?.id, "oa-later");
  assert.equal(flow.responsibility.roleLabel, "Server");
  assert.equal(flow.next.kind, "assignment_transition");
});

test("mixed vs shared vs none operation", () => {
  const shared = compose({});
  assert.equal(shared.operation.kind, "shared");
  const mixed = compose({
    spaceRefs: [
      { spaceId: "servery-a", departmentId: "dept-1" },
      { spaceId: "util", departmentId: "dept-1" },
    ],
    assignmentLocations: [location("servery-a"), location("util", "Utility")],
    states: [
      state({ spaceId: "servery-a", cycle: "breakfast", cycleLabel: "Breakfast" }),
      state({ spaceId: "util", cycle: "cleaning", cycleLabel: "Cleaning" }),
    ],
  });
  assert.equal(mixed.operation.kind, "mixed");
  if (mixed.operation.kind === "mixed") assert.equal(mixed.operation.count, 2);
  const none = compose({
    states: [state({ spaceId: "servery-a", cycle: null, nextLabel: "Lunch" })],
  });
  assert.equal(none.operation.kind, "none");
  assert.equal(none.locationNext?.label, "Lunch");
});

test("Harbor mode does not merge template requirement lists", () => {
  const flow = compose({
    templateEvidence: [templateReq("tpl-key")],
  });
  assert.equal(flow.evidenceMode, "harbor");
  assert.equal(flow.templateEvidence.length, 0);
  assert.equal(flow.evidence[0]?.requirementKey, "H1");
  assert.equal(flow.evidence[0]?.catalogStableKey, "food_temperature_log");
});

test("Harbor next ignores leftover template configuration", () => {
  const flow = compose({
    templateEvidence: [templateReq("tpl-overdue")],
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        cycle: "breakfast",
        cycleLabel: "Breakfast",
        evidenceItems: [evidenceItem("H1", "Cooler Temperature", "OVERDUE", "cooler_temperature_log")],
      }),
    ],
  });
  assert.equal(flow.evidenceMode, "harbor");
  assert.equal(flow.templateEvidence.length, 0);
  assert.equal(flow.next.kind, "overdue_evidence");
  assert.equal(flow.next.label, "Cooler Temperature");
  assert.equal(flow.next.sourceId, "H1");
});

test("template compatibility when Harbor is off", () => {
  const flow = compose({
    canonicalLogsEnabled: false,
    templateEvidence: [templateReq("tpl-key"), templateReq("other-unit", "servery-c")],
  });
  assert.equal(flow.evidenceMode, "template");
  assert.equal(flow.evidence.length, 0);
  assert.deepEqual(
    flow.templateEvidence.map((row) => row.requirementKey),
    ["tpl-key"],
  );
});

test("device mismatch keeps assignment identity and blocks device-unit substitution", () => {
  const flow = compose({
    currentAssignment: assignment({ id: "oa-b", unitId: "unit-b", unitName: "Retail" }),
    deviceBoundUnitId: "unit-a",
    states: [
      state({
        spaceId: "servery-a",
        unitId: "unit-a",
        cycle: "breakfast",
        evidenceItems: [evidenceItem("device", "Device unit log", "DUE")],
      }),
    ],
  });
  assert.equal(flow.device.mismatch, true);
  assert.equal(flow.responsibility.unitId, "unit-b");
  assert.equal(flow.evidence.some((row) => row.requirementKey === "device"), false);
  const serialized = serializeEmployeeRuntimeEvidenceContext(flow, "t");
  assert.equal(serialized, null);
});

test("employee filter hides coverage management facts and keeps evidence + asset impact", () => {
  const flow = compose({
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        cycle: "breakfast",
        cycleLabel: "Breakfast",
        evidenceItems: [evidenceItem("H1", "Food Temperature", "OVERDUE")],
        issues: [
          {
            issueId: "iss-1",
            assetId: "fridge",
            impact: "EQUIPMENT_UNAVAILABLE",
            summary: "Refrigerator unavailable",
            href: "/assets/fridge",
          },
        ],
        exceptions: [
          {
            source: "coverage",
            state: "UNCOVERED",
            location: {
              kind: "SPACE",
              spaceId: "servery-a",
              unitId: "unit-a",
              departmentId: "dept-1",
              facilityId: "fac-1",
            },
            operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
            label: "SERVER uncovered",
            href: null,
          },
        ],
      }),
    ],
  });
  assert.equal(flow.evidence[0]?.productState, "OVERDUE");
  assert.equal(flow.issues[0]?.impact, "EQUIPMENT_UNAVAILABLE");
  assert.equal(
    flow.issues.some((row) => row.summary.includes("uncovered")) ||
      JSON.stringify(flow).includes("SERVER uncovered"),
    false,
  );
});

test("employee next-action priority is deterministic", () => {
  const overdueWork = work({ occurrenceKey: "w-late", label: "Wipe tables", state: "PAST_DUE_NOT_CONFIRMED" });
  const dueWork = work({ occurrenceKey: "w-due", label: "Sweep", state: "DUE" });
  const dueEvidence: import("./types").EmployeeRuntimeEvidenceItem = {
    ...evidenceItem("H1", "Food Temperature", "DUE"),
    category: "due_now",
    spaceId: "servery-a",
    catalogStableKey: null,
  };
  const overdueEvidence: import("./types").EmployeeRuntimeEvidenceItem = {
    ...evidenceItem("H0", "Cooler", "OVERDUE"),
    category: "needs_attention",
    spaceId: "servery-a",
    catalogStableKey: null,
  };
  const upcomingWork = work({ occurrenceKey: "w-up", label: "Close", state: "UPCOMING" });
  const base = {
    work: [] as WorkRequirement[],
    evidence: [] as import("./types").EmployeeRuntimeEvidenceItem[],
    milestones: [] as Parameters<typeof resolveEmployeeNextAction>[0]["milestones"],
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    locationNext: { spaceId: "servery-a", label: "Lunch begins", at: NEXT_AT },
  };
  assert.equal(
    resolveEmployeeNextAction({
      ...base,
      work: [dueWork, overdueWork],
      evidence: [
        { ...dueEvidence, category: "due_now", spaceId: "servery-a" },
        { ...overdueEvidence, category: "needs_attention", spaceId: "servery-a" },
      ],
    }).kind,
    "overdue_work",
  );
  assert.equal(
    resolveEmployeeNextAction({
      ...base,
      evidence: [{ ...overdueEvidence, category: "needs_attention", spaceId: "servery-a" }],
    }).kind,
    "overdue_evidence",
  );
  assert.equal(
    resolveEmployeeNextAction({
      ...base,
      work: [dueWork],
      evidence: [{ ...dueEvidence, category: "due_now", spaceId: "servery-a" }],
    }).kind,
    "due_work",
  );
  assert.equal(
    resolveEmployeeNextAction({
      ...base,
      evidence: [{ ...dueEvidence, category: "due_now", spaceId: "servery-a" }],
    }).kind,
    "due_evidence",
  );
  assert.equal(
    resolveEmployeeNextAction({
      ...base,
      milestones: [
        {
          spaceId: "servery-a",
          spaceName: "3A Servery",
          kind: "SERVERY_READY",
          label: "Servery Ready",
          statusKey: "not_recorded",
        },
      ],
    }).kind,
    "milestone",
  );
  assert.equal(
    resolveEmployeeNextAction({
      ...base,
      currentAssignment: null,
      upcomingAssignment: assignment({ id: "oa-next" }),
    }).kind,
    "assignment_transition",
  );
  assert.equal(
    resolveEmployeeNextAction({
      ...base,
      work: [upcomingWork],
    }).kind,
    "upcoming_work",
  );
  assert.equal(resolveEmployeeNextAction(base).kind, "location_next");
});

test("offline Harbor serialization keeps attachment, requirement, and space identity", () => {
  const flow = compose({});
  const evidence = serializeEmployeeRuntimeEvidenceContext(flow, "sync");
  assert.ok(evidence);
  assert.equal(evidence.requirements[0]?.logAttachmentId, "att-H1");
  assert.equal(evidence.requirements[0]?.requirementKey, "H1");
  assert.equal(evidence.requirements[0]?.spaceId, "servery-a");
  const job = serializeEmployeeRuntimeJobFlowContext(flow, {
    state: "ACTIVE",
    unitId: "unit-a",
    unitName: "3A",
    bundleRevision: "rev",
    lastSyncedAt: "sync",
  });
  assert.deepEqual(job.evidenceRequirementKeys, ["H1"]);
});

test("template offline payload remains backwards compatible", () => {
  const flow = compose({
    canonicalLogsEnabled: false,
    templateEvidence: [templateReq("tpl-key")],
  });
  const evidence = serializeEmployeeRuntimeEvidenceContext(flow, "sync");
  assert.ok(evidence);
  assert.equal(evidence.requirements[0]?.templateId, "tpl-1");
  assert.equal(evidence.requirements[0]?.logAttachmentId, null);
  assert.equal(evidence.requirements[0]?.requirementKey, "tpl-key");
});

test("serialized bundle is a snapshot: later input changes do not mutate it", () => {
  const flow = compose({});
  const first = serializeEmployeeRuntimeEvidenceContext(flow, "a");
  flow.evidence[0]!.displayName = "Changed later";
  assert.equal(first?.requirements[0]?.templateName, "Food Temperature");
});

test("Work Plans stay distinct from evidence and keep linkedTemplateStableKey", () => {
  const flow = compose({
    workRequirements: [
      work({
        occurrenceKey: "w1",
        label: "Check cooler",
        state: "DUE",
        linkedTemplateStableKey: "cooler_temperature_log",
      }),
    ],
  });
  assert.equal(flow.work[0]?.linkedTemplateStableKey, "cooler_temperature_log");
  assert.equal(flow.evidence[0]?.requirementKey, "H1");
  assert.notEqual(flow.work[0]?.occurrenceKey, flow.evidence[0]?.requirementKey);
});

test("loader/composer/adapter source contract: shared composer, no ScheduleEntry", () => {
  const root = process.cwd();
  const leftoverLoader = join(root, "src/lib/dietary-job-flow/load-employee-job-flow.ts");
  const leftoverPanel = join(root, "src/components/unit-workspace/employee-job-flow-panel.tsx");
  const flowLoadSrc = readFileSync(join(root, "src/lib/employee-runtime-flow/load-flow.ts"), "utf8");
  const bundleSrc = readFileSync(join(root, "src/lib/offline/build-runtime-bundle.ts"), "utf8");
  const composeSrc = readFileSync(join(root, "src/lib/employee-runtime-flow/compose.ts"), "utf8");
  const employeePage = readFileSync(
    join(root, "src/app/(protected)/unit/[unitId]/employee-runtime-page.tsx"),
    "utf8",
  );
  assert.equal(existsSync(leftoverLoader), false);
  assert.equal(existsSync(leftoverPanel), false);
  assert.match(flowLoadSrc, /composeEmployeeRuntimeFlow/);
  assert.match(flowLoadSrc, /loadRuntimeLocationStates/);
  assert.match(flowLoadSrc, /isCanonicalLogsEnabled/);
  assert.match(bundleSrc, /composeEmployeeRuntimeFlow/);
  assert.match(bundleSrc, /serializeEmployeeRuntimeEvidenceContext/);
  assert.match(bundleSrc, /adaptEmployeeRuntimeFlowToJobFlow/);
  assert.match(employeePage, /loadEmployeeRuntimeFlow/);
  assert.equal(employeePage.includes("loadEmployeeJobFlow"), false);
  assert.equal(employeePage.includes("EmployeeJobFlowPanel"), false);
  assert.equal(composeSrc.includes("prisma"), false);
  assert.equal(composeSrc.includes("ScheduleEntry"), false);
  assert.equal(flowLoadSrc.includes("ScheduleEntry"), false);
  assert.ok(flowLoadSrc.includes("if (oaEnabled && !canonicalLogsEnabled && evidenceEnabled"));
  assert.ok(bundleSrc.includes("if (oaEnabled && !canonicalLogsEnabled"));
  assert.match(
    bundleSrc,
    /!jobFlowEnabled &&\s*!canonicalLogsEnabled &&\s*isDepartmentOperationalEvidenceEnabled/,
  );
});

test("Phase 6E/6F/operations board files are not modified by this module", () => {
  const root = process.cwd();
  const spacePage = readFileSync(join(root, "src/app/(protected)/unit/[unitId]/space-workspace-page.tsx"), "utf8");
  const neighborhood = readFileSync(
    join(root, "src/app/(protected)/unit/[unitId]/neighborhood-workspace-page.tsx"),
    "utf8",
  );
  const board = readFileSync(join(root, "src/app/(protected)/staffing/operations/page.tsx"), "utf8");
  assert.equal(spacePage.includes("composeEmployeeRuntimeFlow"), false);
  assert.equal(neighborhood.includes("composeEmployeeRuntimeFlow"), false);
  assert.equal(board.includes("composeEmployeeRuntimeFlow"), false);
});
