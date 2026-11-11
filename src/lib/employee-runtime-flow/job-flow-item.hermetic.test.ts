import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";

import {
  composeJobFlowItems,
  dedupeJobFlowItems,
  jobFlowItemFromWorkOrder,
  jobFlowItemsFromAssignmentExceptions,
  jobFlowItemsFromPreventiveMaintenance,
  jobFlowItemsFromWorkOrders,
  suppressPmDuplicatesAgainstWorkOrders,
  type JobFlowPreventiveMaintenanceSource,
  type JobFlowWorkOrderSource,
} from "./job-flow-item";
import { composeEmployeeRuntimeFlow } from "./compose";
import type { EmployeeRuntimeEvidenceItem, EmployeeRuntimeMilestone } from "./types";

function wo(
  partial: Partial<JobFlowWorkOrderSource> & { id: string; title: string; status: string },
): JobFlowWorkOrderSource {
  return {
    id: partial.id,
    repairCode: partial.repairCode ?? `R-${partial.id}`,
    title: partial.title,
    status: partial.status,
    dueAt: partial.dueAt ?? null,
    unitId: partial.unitId ?? "unit-1",
    spaceId: partial.spaceId ?? "space-1",
    assetId: partial.assetId ?? null,
    pmOccurrenceId: partial.pmOccurrenceId ?? null,
    workOrderKind: partial.workOrderKind ?? "CORRECTIVE",
  };
}

test("empty optional contributors contribute zero items", () => {
  assert.deepEqual(jobFlowItemsFromWorkOrders([]), []);
  assert.deepEqual(jobFlowItemsFromPreventiveMaintenance([]), []);
  assert.deepEqual(jobFlowItemsFromAssignmentExceptions([]), []);
  assert.deepEqual(composeJobFlowItems({}), []);
});

test("Records: due, completed, waived/not applicable, and no harbor/template duplicate mode", () => {
  const due: EmployeeRuntimeEvidenceItem = {
    attachmentId: "att-1",
    requirementKey: "req-1",
    displayName: "Cooler log",
    spaceId: "space-1",
    productState: "DUE",
    category: "due_now",
    window: { start: "07:00", end: "09:00" },
    recordId: null,
    href: "/logs",
    catalogStableKey: "cooler",
  };
  const completed: EmployeeRuntimeEvidenceItem = {
    ...due,
    attachmentId: "att-2",
    requirementKey: "req-2",
    displayName: "Freezer log",
    productState: "COMPLETED",
    category: "completed",
  };
  const waivedTemplate = {
    requirementKey: "tpl-waived",
    state: "NOT_APPLICABLE",
    stateLabel: "N/A",
    operationalDateKey: "2026-11-08",
    templateId: "tpl",
    templateStableKey: "tpl",
    templateVersion: 1,
    templateName: "Optional skipped",
    purposeType: "LOG",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    cycleLabel: null,
    windowStartLocal: null,
    windowEndLocal: null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "u1",
    spaceId: "s1",
    assetId: null,
    assetType: null,
    spaceType: null,
    recordId: null,
    recordStatus: null,
    fields: [],
    instructions: null,
  } as EvidenceRequirement;

  const harborOnly = composeJobFlowItems({ harborEvidence: [due, completed] });
  assert.equal(harborOnly.filter((row) => row.ownerKind === "RECORD_REQUIREMENT").length, 2);
  assert.equal(harborOnly.find((row) => row.ownerId === "att-1:req-1")?.attention, "due_now");
  assert.equal(harborOnly.find((row) => row.ownerId === "att-2:req-2")?.attention, "completed");

  const templateOnly = composeJobFlowItems({ templateEvidence: [waivedTemplate] });
  assert.equal(templateOnly[0]?.attention, "not_applicable");

  // Compose may receive both arrays only in tests; production evidenceMode is exclusive.
  // Dedup is by owner identity — different keys remain distinct facts.
  const both = composeJobFlowItems({
    harborEvidence: [due],
    templateEvidence: [waivedTemplate],
  });
  assert.equal(both.filter((row) => row.ownerKind === "RECORD_REQUIREMENT").length, 2);
});

test("Operating Rhythm: Key Point attention and stable identity across status changes", () => {
  const upcoming: EmployeeRuntimeMilestone = {
    spaceId: "space-1",
    spaceName: "Servery",
    kind: "KEY_TIME",
    label: "Breakfast start",
    statusKey: "upcoming",
    cycleStableKey: "breakfast",
    expectedLocal: "07:30",
  };
  const overdue: EmployeeRuntimeMilestone = {
    ...upcoming,
    statusKey: "overdue",
  };
  const optionalAdjusted: EmployeeRuntimeMilestone = {
    spaceId: "space-1",
    spaceName: "Servery",
    kind: "KEY_TIME",
    label: "Informational checkpoint",
    statusKey: "adjusted",
    cycleStableKey: "snack",
    expectedLocal: "10:00",
    adjustedLocal: "10:15",
  };
  const items = composeJobFlowItems({ milestones: [upcoming, overdue, optionalAdjusted] });
  // upcoming + overdue share stable ownerId → dedupe keeps first
  assert.equal(
    items.filter((row) => row.ownerId === "space-1:breakfast:KEY_TIME").length,
    1,
  );
  assert.equal(
    items.find((row) => row.ownerId === "space-1:breakfast:KEY_TIME")?.attention,
    "upcoming",
  );
  assert.equal(
    items.find((row) => row.ownerId === "space-1:snack:KEY_TIME")?.attention,
    "upcoming",
  );
  assert.equal(
    items.find((row) => row.ownerId === "space-1:snack:KEY_TIME")?.ownerState,
    "adjusted",
  );
});

test("no published Cycle / empty milestones contribute zero Key Point items", () => {
  const items = composeJobFlowItems({ milestones: [] });
  assert.equal(items.filter((row) => row.ownerKind === "OPERATING_RHYTHM_KEY_POINT").length, 0);
});

test("Plant: assigned and completed Work Orders; unauthorized rows never enter via adapter alone", () => {
  const assigned = wo({ id: "wo-1", title: "Fix sink", status: "ASSIGNED" });
  const completed = wo({ id: "wo-2", title: "Belt", status: "COMPLETED" });
  const items = jobFlowItemsFromWorkOrders([assigned, completed]);
  assert.equal(items.length, 2);
  assert.equal(items[0]?.ownerKind, "WORK_ORDER");
  assert.equal(items[0]?.href, "/repairs/wo-1");
  assert.equal(items[0]?.attention, "due_now");
  assert.equal(items[1]?.attention, "completed");
  // Adapter does not invent facility-wide visibility — empty input stays empty.
  assert.deepEqual(jobFlowItemsFromWorkOrders([]), []);
});

test("PM-generated Work Order deduplicates against PREVENTIVE_MAINTENANCE", () => {
  const pmWo = wo({
    id: "wo-pm",
    title: "Quarterly filter",
    status: "ASSIGNED",
    pmOccurrenceId: "pm-occ-1",
    workOrderKind: "PREVENTIVE",
  });
  const pmRow: JobFlowPreventiveMaintenanceSource = {
    id: "pm-occ-1",
    label: "Quarterly filter",
    status: "OPEN",
    unitId: "unit-1",
    spaceId: null,
    assetId: "asset-1",
    activeWorkOrderId: null,
    dueAt: null,
  };
  const items = composeJobFlowItems({
    workOrders: [pmWo],
    preventiveMaintenance: [pmRow],
  });
  assert.equal(items.filter((row) => row.ownerKind === "WORK_ORDER").length, 1);
  assert.equal(items.filter((row) => row.ownerKind === "PREVENTIVE_MAINTENANCE").length, 0);
  assert.match(items[0]?.ownerState ?? "", /pm:pm-occ-1/);

  const suppressed = suppressPmDuplicatesAgainstWorkOrders([
    jobFlowItemFromWorkOrder(pmWo),
    ...jobFlowItemsFromPreventiveMaintenance([pmRow]),
  ]);
  assert.equal(suppressed.filter((row) => row.ownerKind === "PREVENTIVE_MAINTENANCE").length, 0);
});

test("PM plan absence and PM with active WO contribute no standalone PM action", () => {
  assert.deepEqual(jobFlowItemsFromPreventiveMaintenance([]), []);
  const withActiveWo = jobFlowItemsFromPreventiveMaintenance([
    {
      id: "pm-2",
      label: "Belt",
      status: "OPEN",
      unitId: null,
      spaceId: null,
      assetId: null,
      activeWorkOrderId: "wo-x",
      dueAt: null,
    },
  ]);
  assert.deepEqual(withActiveWo, []);
});

test("Workforce: call-off exception; no Assignment / no coverage invent nothing", () => {
  const items = composeJobFlowItems({
    assignmentExceptions: [
      {
        id: "call-off:se-1",
        kind: "CALL_OFF",
        label: "Called off — illness",
        ownerState: "CALL_OFF",
        unitId: "unit-1",
        href: "/staffing?date=2026-11-08",
      },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.ownerKind, "ASSIGNMENT_EXCEPTION");
  assert.equal(items[0]?.attention, "needs_attention");
  assert.deepEqual(composeJobFlowItems({ assignmentExceptions: [] }), []);
});

test("Platform: stable identity, deterministic sort, domain state preserved, no Job Flow persistence", () => {
  const a = wo({ id: "wo-b", title: "B", status: "ASSIGNED", dueAt: new Date("2026-11-08T12:00:00Z") });
  const b = wo({ id: "wo-a", title: "A", status: "COMPLETED", dueAt: new Date("2026-11-08T10:00:00Z") });
  const once = composeJobFlowItems({ workOrders: [a, b, a] });
  const twice = composeJobFlowItems({ workOrders: [a, b, a] });
  assert.deepEqual(
    once.map((row) => `${row.ownerKind}:${row.ownerId}:${row.attention}`),
    twice.map((row) => `${row.ownerKind}:${row.ownerId}:${row.attention}`),
  );
  assert.equal(once.length, 2);
  assert.equal(once[0]?.attention, "due_now");
  assert.equal(once[0]?.ownerId, "wo-b");
  assert.equal(once[1]?.attention, "completed");
  assert.equal(dedupeJobFlowItems(once).length, 2);
});

test("composeJobFlowItems merges Records, Key Points, and WO without inventing overdue", () => {
  const evidence: EmployeeRuntimeEvidenceItem = {
    attachmentId: "att-1",
    requirementKey: "req-1",
    displayName: "Cooler log",
    spaceId: "space-1",
    productState: "DUE",
    category: "due_now",
    window: { start: "07:00", end: "09:00" },
    recordId: null,
    href: "/logs",
    catalogStableKey: "cooler",
  };
  const milestone: EmployeeRuntimeMilestone = {
    spaceId: "space-1",
    spaceName: "Servery",
    kind: "KEY_TIME",
    label: "Ready for service",
    statusKey: "due",
    cycleStableKey: "lunch",
    expectedLocal: "11:30",
  };
  const items = composeJobFlowItems({
    harborEvidence: [evidence],
    milestones: [milestone],
    workOrders: [wo({ id: "wo-1", title: "Leak", status: "IN_PROGRESS" })],
  });
  assert.equal(items.filter((row) => row.ownerKind === "RECORD_REQUIREMENT").length, 1);
  assert.equal(items.filter((row) => row.ownerKind === "OPERATING_RHYTHM_KEY_POINT").length, 1);
  assert.equal(items.filter((row) => row.ownerKind === "WORK_ORDER").length, 1);
  assert.equal(
    items.find((row) => row.ownerKind === "OPERATING_RHYTHM_KEY_POINT")?.ownerState,
    "due",
  );
});

test("Employee Runtime Flow compose retains assigned Work Orders without inventing Assignment", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: null,
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workOrders: [wo({ id: "wo-signed", title: "Assigned WO", status: "ASSIGNED" })],
  });
  assert.equal(flow.assignmentAvailability, "no_confirmed_assignment");
  assert.equal(flow.items.filter((row) => row.ownerKind === "WORK_ORDER").length, 1);
});

test("template evidence adapter stays Records-owned and non-compatibility", () => {
  const row = {
    requirementKey: "tpl-req",
    state: "DUE",
    stateLabel: "Due",
    operationalDateKey: "2026-11-08",
    templateId: "tpl",
    templateStableKey: "tpl",
    templateVersion: 1,
    templateName: "Sanitizer",
    purposeType: "LOG",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    cycleLabel: null,
    windowStartLocal: "10:00",
    windowEndLocal: "11:00",
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "u1",
    spaceId: "s1",
    assetId: null,
    assetType: null,
    spaceType: null,
    recordId: null,
    recordStatus: null,
    fields: [],
    instructions: null,
  } as EvidenceRequirement;
  const items = composeJobFlowItems({ templateEvidence: [row] });
  assert.equal(items[0]?.ownerKind, "RECORD_REQUIREMENT");
  assert.equal(items[0]?.label, "Sanitizer");
});
