import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDepartmentProduct } from "@/lib/department-products";
import { decidePmPlanAuthority } from "./authority";
import { facilityCivilToday } from "./civil-date";
import { presentPmWorkOrderContext } from "./pm-context";
import {
  classifyPmRunAttention,
  comparePmRunRows,
  groupPmRunBoard,
  hasPmAttention,
  isPmDueSoon,
  isPmProcedureOptionalAbsence,
  isPmRunUnassigned,
  presentPmOccurrenceStateLabel,
  presentPmProcedureField,
  presentPmWorkOrderKindLabel,
  type PmRunRowInput,
} from "./run-board";
import { presentPmOccurrence } from "./version-semantics";

function row(overrides: Partial<PmRunRowInput> = {}): PmRunRowInput {
  return {
    occurrenceId: "occ-1",
    planId: "plan-1",
    planName: "Quarterly AHU PM",
    planStatus: "PUBLISHED",
    assetName: "AHU-1",
    assetCode: "AHU-1",
    assetStatus: "OPERATIONAL",
    locationLabel: "Unit A / Mechanical",
    locationIsPreview: false,
    scheduledDate: "2027-04-15",
    occurrenceStatus: "OPEN",
    generationLeadDays: 7,
    facilityToday: "2027-04-15",
    categoryLabel: "HVAC",
    priority: "MEDIUM",
    procedureLabel: "AHU SOP v1",
    workOrders: [
      {
        id: "wo-1",
        repairCode: "R-1",
        status: "ASSIGNED",
        assignedEmployeeId: "emp-1",
        assigneeLabel: "Pat Tech",
        priority: "MEDIUM",
      },
    ],
    skipReason: null,
    skippedAt: null,
    skippedByLabel: null,
    completedAt: null,
    configurationIssue: null,
    ...overrides,
  };
}

test("Facility Plant Operations is AVAILABLE", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "AVAILABLE");
});

test("Work Order kind labels are Product copy, not raw enums", () => {
  assert.equal(presentPmWorkOrderKindLabel("PREVENTIVE"), "Preventive");
  assert.equal(presentPmWorkOrderKindLabel("CORRECTIVE"), "Corrective");
  assert.equal(presentPmOccurrenceStateLabel("OVERDUE"), "Overdue");
  assert.equal(presentPmOccurrenceStateLabel("DUE"), "Due today");
  assert.equal(presentPmOccurrenceStateLabel("SKIPPED"), "Skipped");
  assert.equal(presentPmOccurrenceStateLabel("PROJECTED"), "Upcoming schedule");
  assert.doesNotMatch(presentPmOccurrenceStateLabel("OVERDUE"), /compliant/i);
});

test("Due soon is OPEN, upcoming, and inside the generation lead window", () => {
  assert.equal(
    isPmDueSoon({
      occurrenceStatus: "OPEN",
      scheduledDate: "2027-04-20",
      facilityToday: "2027-04-15",
      generationLeadDays: 7,
    }),
    true,
  );
  assert.equal(
    isPmDueSoon({
      occurrenceStatus: "OPEN",
      scheduledDate: "2027-04-20",
      facilityToday: "2027-04-15",
      generationLeadDays: 2,
    }),
    false,
  );
  assert.equal(
    isPmDueSoon({
      occurrenceStatus: "COMPLETED",
      scheduledDate: "2027-04-20",
      facilityToday: "2027-04-15",
      generationLeadDays: 7,
    }),
    false,
  );
});

test("Due today and Overdue are Facility-civil projections of OPEN occurrences", () => {
  assert.equal(
    presentPmOccurrence({
      status: "OPEN",
      scheduledDate: "2027-04-15",
      facilityToday: "2027-04-15",
    }),
    "DUE",
  );
  assert.equal(
    presentPmOccurrence({
      status: "OPEN",
      scheduledDate: "2027-04-10",
      facilityToday: "2027-04-15",
    }),
    "OVERDUE",
  );
  assert.equal(
    presentPmOccurrence({
      status: "SKIPPED",
      scheduledDate: "2027-04-10",
      facilityToday: "2027-04-15",
    }),
    "SKIPPED",
  );
});

test("Run board groups exception-first and sorts overdue oldest first", () => {
  const overdueOlder = row({
    occurrenceId: "overdue-old",
    planName: "April AHU PM",
    scheduledDate: "2027-04-01",
    facilityToday: "2027-04-20",
  });
  const overdueNewer = row({
    occurrenceId: "overdue-new",
    planName: "Later AHU PM",
    scheduledDate: "2027-04-10",
    facilityToday: "2027-04-20",
  });
  const dueTodayHigh = row({
    occurrenceId: "due-today",
    planName: "Due today high",
    scheduledDate: "2027-04-20",
    facilityToday: "2027-04-20",
    priority: "HIGH",
  });
  const dueSoon = row({
    occurrenceId: "due-soon",
    planName: "Due soon",
    scheduledDate: "2027-04-25",
    facilityToday: "2027-04-20",
    generationLeadDays: 7,
  });
  const unassigned = row({
    occurrenceId: "unassigned",
    planName: "Unassigned PM",
    scheduledDate: "2027-04-22",
    facilityToday: "2027-04-20",
    generationLeadDays: 7,
    workOrders: [
      {
        id: "wo-open",
        repairCode: "R-U",
        status: "OPEN",
        assignedEmployeeId: null,
        assigneeLabel: null,
        priority: "MEDIUM",
      },
    ],
  });
  const completed = row({
    occurrenceId: "done",
    occurrenceStatus: "COMPLETED",
    scheduledDate: "2027-01-15",
    completedAt: "2027-01-20T00:00:00.000Z",
  });
  const skipped = row({
    occurrenceId: "skipped",
    occurrenceStatus: "SKIPPED",
    scheduledDate: "2027-07-15",
    skipReason: "Vendor already serviced this cycle.",
  });
  const projected = row({
    occurrenceId: null,
    occurrenceStatus: "PROJECTED",
    scheduledDate: "2027-10-15",
    locationIsPreview: true,
    workOrders: [],
  });

  const grouped = groupPmRunBoard([
    projected,
    completed,
    skipped,
    dueSoon,
    unassigned,
    dueTodayHigh,
    overdueNewer,
    overdueOlder,
  ]);

  assert.deepEqual(
    grouped.overdue.map((item) => item.occurrenceId),
    ["overdue-old", "overdue-new"],
  );
  assert.equal(grouped.dueToday[0]?.occurrenceId, "due-today");
  assert.equal(grouped.dueSoon.some((item) => item.occurrenceId === "due-soon"), true);
  assert.equal(grouped.unassigned[0]?.occurrenceId, "unassigned");
  assert.equal(grouped.completed[0]?.occurrenceId, "done");
  assert.equal(grouped.skipped[0]?.occurrenceId, "skipped");
  assert.equal(grouped.projected[0]?.occurrenceId, null);
  assert.equal(grouped.counts.overdue, 2);
  assert.equal(grouped.counts.dueToday, 1);
  assert.equal(hasPmAttention(grouped.counts), true);
});

test("Needs configuration is OPEN in-window with no Work Order, not a canceled replacement", () => {
  const missing = row({
    occurrenceId: "needs-config",
    scheduledDate: "2027-04-15",
    facilityToday: "2027-04-15",
    workOrders: [],
  });
  const canceled = row({
    occurrenceId: "canceled-open",
    scheduledDate: "2027-04-15",
    facilityToday: "2027-04-15",
    workOrders: [
      {
        id: "wo-old",
        repairCode: "R-OLD",
        status: "CANCELLED",
        assignedEmployeeId: "emp-1",
        assigneeLabel: "Pat Tech",
        priority: "MEDIUM",
      },
    ],
  });
  assert.deepEqual(classifyPmRunAttention(missing), ["NEEDS_CONFIGURATION", "DUE_TODAY"]);
  assert.deepEqual(classifyPmRunAttention(canceled), ["DUE_TODAY"]);
  const grouped = groupPmRunBoard([missing, canceled]);
  assert.equal(grouped.needsConfiguration.length, 1);
  assert.equal(grouped.dueToday.length, 2);
});

test("No Procedure is valid configuration, not Needs configuration", () => {
  assert.equal(isPmProcedureOptionalAbsence(null), true);
  assert.equal(isPmProcedureOptionalAbsence(undefined), true);
  assert.equal(isPmProcedureOptionalAbsence(""), true);
  assert.equal(isPmProcedureOptionalAbsence("proc-1"), false);
  assert.equal(presentPmProcedureField(null), "None");
  assert.equal(presentPmProcedureField("AHU SOP v1"), "AHU SOP v1");
  const generated = row({
    occurrenceId: "no-procedure",
    procedureLabel: null,
    scheduledDate: "2027-04-15",
    facilityToday: "2027-04-15",
    configurationIssue: null,
  });
  assert.deepEqual(classifyPmRunAttention(generated), ["DUE_TODAY"]);
  const grouped = groupPmRunBoard([generated]);
  assert.equal(grouped.needsConfiguration.length, 0);
  assert.equal(grouped.dueToday.length, 1);
});

test("Unassigned requires an active Work Order without an assignee", () => {
  assert.equal(
    isPmRunUnassigned({
      occurrenceStatus: "OPEN",
      workOrders: [
        {
          id: "wo-1",
          repairCode: "R-1",
          status: "OPEN",
          assignedEmployeeId: null,
          assigneeLabel: null,
          priority: "MEDIUM",
        },
      ],
    }),
    true,
  );
  assert.equal(
    isPmRunUnassigned({
      occurrenceStatus: "OPEN",
      workOrders: [
        {
          id: "wo-1",
          repairCode: "R-1",
          status: "CANCELLED",
          assignedEmployeeId: null,
          assigneeLabel: null,
          priority: "MEDIUM",
        },
      ],
    }),
    false,
  );
});

test("Plan, occurrence, and Work Order statuses stay independent", () => {
  const input = row({
    planStatus: "PUBLISHED",
    occurrenceStatus: "OPEN",
    scheduledDate: "2027-04-01",
    facilityToday: "2027-04-20",
    workOrders: [
      {
        id: "wo-1",
        repairCode: "R-1",
        status: "IN_PROGRESS",
        assignedEmployeeId: "emp-1",
        assigneeLabel: "Pat Tech",
        priority: "HIGH",
      },
    ],
  });
  assert.equal(input.planStatus, "PUBLISHED");
  assert.equal(input.occurrenceStatus, "OPEN");
  assert.equal(
    presentPmOccurrence({
      status: input.occurrenceStatus,
      scheduledDate: input.scheduledDate,
      facilityToday: input.facilityToday,
    }),
    "OVERDUE",
  );
  assert.equal(input.workOrders[0]?.status, "IN_PROGRESS");
});

test("empty attention counts produce the no-attention empty state", () => {
  const grouped = groupPmRunBoard([]);
  assert.equal(hasPmAttention(grouped.counts), false);
  assert.equal(grouped.counts.overdue, 0);
  assert.equal(grouped.counts.needsConfiguration, 0);
});

test("Facility timezone, not the UTC instant, decides Due today vs Overdue", () => {
  const now = new Date("2027-04-16T06:30:00.000Z");
  const laToday = facilityCivilToday("America/Los_Angeles", now);
  const utcKey = now.toISOString().slice(0, 10);
  assert.equal(laToday, "2027-04-15");
  assert.equal(utcKey, "2027-04-16");
  assert.equal(
    presentPmOccurrence({
      status: "OPEN",
      scheduledDate: "2027-04-15",
      facilityToday: laToday,
    }),
    "DUE",
  );
  assert.equal(
    presentPmOccurrence({
      status: "OPEN",
      scheduledDate: "2027-04-15",
      facilityToday: utcKey,
    }),
    "OVERDUE",
  );
});

test("STAFF cannot skip; Supervisor+ can, including Quick PIN", () => {
  const base = {
    flagEnabled: true,
    authMethod: "PASSWORD" as const,
    sessionFacilityId: "fac-1",
    facilityId: "fac-1",
    departmentId: "dept-1",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "dept-1",
  };
  assert.equal(decidePmPlanAuthority({ ...base, role: "STAFF" }).canSkip, false);
  assert.equal(decidePmPlanAuthority({ ...base, role: "SUPERVISOR" }).canSkip, true);
  assert.equal(
    decidePmPlanAuthority({ ...base, role: "SUPERVISOR", authMethod: "QUICK_PIN" }).canSkip,
    true,
  );
  assert.equal(
    decidePmPlanAuthority({ ...base, role: "SUPERVISOR", authMethod: "QUICK_PIN" }).canDraft,
    false,
  );
});

test("PM Work Order context is occurrence-backed, not a sourceType string", () => {
  const context = presentPmWorkOrderContext({
    workOrderKind: "PREVENTIVE",
    pmOccurrence: {
      id: "occ-1",
      planId: "plan-1",
      scheduledDate: "2027-04-15",
      status: "OPEN",
      planVersion: {
        name: "Quarterly Dishwasher PM",
        procedureVersion: { version: 1, title: "Dishwasher SOP" },
        recordRequirements: [{ templateName: "PM Inspection" }],
      },
    },
  });
  assert.equal(context?.planName, "Quarterly Dishwasher PM");
  assert.equal(context?.scheduledDate, "2027-04-15");
  assert.equal(context?.procedureLabel, "Dishwasher SOP v1");
  assert.deepEqual(context?.requirementLabels, ["PM Inspection"]);
  const withoutProcedure = presentPmWorkOrderContext({
    workOrderKind: "PREVENTIVE",
    pmOccurrence: {
      id: "occ-2",
      planId: "plan-2",
      scheduledDate: "2027-04-15",
      status: "OPEN",
      planVersion: { name: "No Procedure PM" },
    },
  });
  assert.equal(withoutProcedure?.procedureLabel, null);
  assert.equal(presentPmProcedureField(withoutProcedure?.procedureLabel), "None");
  assert.equal(
    presentPmWorkOrderContext({ workOrderKind: "CORRECTIVE", pmOccurrence: null }),
    null,
  );
});

test("Due today sorts by priority then name", () => {
  const routine = row({
    occurrenceId: "routine",
    planName: "Alpha PM",
    priority: "MEDIUM",
    scheduledDate: "2027-04-15",
    facilityToday: "2027-04-15",
  });
  const urgent = row({
    occurrenceId: "urgent",
    planName: "Zulu PM",
    priority: "URGENT",
    scheduledDate: "2027-04-15",
    facilityToday: "2027-04-15",
  });
  assert.ok(comparePmRunRows("DUE_TODAY", urgent, routine) < 0);
});

test("Run UI does not invoke the generator or invent compliance language", () => {
  const board = readFileSync(
    join(process.cwd(), "src/components/plant-operations/pm-run-board.tsx"),
    "utf8",
  );
  const page = readFileSync(
    join(process.cwd(), "src/app/(protected)/preventive-maintenance/page.tsx"),
    "utf8",
  );
  const load = readFileSync(
    join(process.cwd(), "src/lib/preventive-maintenance/run-load.ts"),
    "utf8",
  );
  const skipForm = readFileSync(
    join(process.cwd(), "src/components/plant-operations/pm-skip-form.tsx"),
    "utf8",
  );
  assert.doesNotMatch(board, /generatePmForFacility/);
  assert.doesNotMatch(page, /generatePmForFacility/);
  assert.doesNotMatch(load, /generatePmForFacility/);
  assert.doesNotMatch(load, /runPmGeneration/);
  assert.match(load, /Does not invoke the generator/);
  assert.doesNotMatch(board, /Compliant|Non-compliant|MTBF|MTTR/i);
  assert.doesNotMatch(skipForm, /from "\.\/skip"|from "@\/lib\/preventive-maintenance\/skip"/);
  assert.match(skipForm, /WAIVE_REASON_MIN_LENGTH/);
  assert.match(
    skipForm,
    /This skips only this scheduled maintenance. Future schedule dates will not change/,
  );
});
