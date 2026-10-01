import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import { buildLogRequirementKey } from "@/lib/logs-architecture/requirement-key";
import { resolveWorkRequirements } from "@/lib/department-work/resolve-requirements";
import type { PublishedWorkPlanForResolve } from "@/lib/department-work/types";
import { validateEvidenceSubmission } from "@/lib/operational-evidence/validate-evidence-submission";
import type { TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

import {
  attachmentLineageKey,
  classifyAttachmentUpdate,
  type AttachmentHistoricalSnapshot,
} from "./attachment-update-policy";
import { projectLogExpectationHistory } from "./expectation-history";
import {
  expandOperationalTypeSpaces,
  matchLogAttachmentToLocation,
} from "./log-operational-type-applicability";
import {
  followUpRecordDecision,
  legacyRecordWriteDecision,
  pinSubmittedStandard,
  presentRecordForm,
  recordPurposeRejection,
} from "./record-engine";
import {
  resolveLogRequirementsForAttachment,
  type LogAttachmentForResolve,
  type PublishedCycleForLogs,
} from "./resolve-log-requirements";

const root = new URL("../../../", import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

function windows(cadence: "TWICE_DAILY" | "THREE_TIMES_DAILY") {
  return daypartWindowsForCadence(cadence).map((window, index) => ({
    label: window.label,
    startLocal: window.startLocal,
    endLocal: window.endLocal,
    displaySequence: (index + 1) * 10,
  }));
}

function snap(overrides?: Partial<AttachmentHistoricalSnapshot>): AttachmentHistoricalSnapshot {
  return {
    timingMode: "DAILY_WINDOWS",
    dailyWindows: windows("TWICE_DAILY").map(({ label, startLocal, endLocal }) => ({
      label,
      startLocal,
      endLocal,
    })),
    cycleStableKeys: [],
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    allowAdHoc: false,
    waiverAllowed: false,
    catalogDefinitionId: "cat-v3",
    catalogVersion: 3,
    departmentId: "dietary",
    targetKind: "OPERATIONAL_TYPE",
    assetId: null,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: "food_service_area",
    ...overrides,
  };
}

function temperatureField(overrides?: Partial<TemplateFieldSnapshot>): TemplateFieldSnapshot {
  return {
    fieldKey: "temperature",
    label: "Temperature",
    fieldType: "TEMPERATURE",
    isRequired: true,
    displaySequence: 10,
    helpText: null,
    unitLabel: "°F",
    minNumber: 33,
    maxNumber: 41,
    allowedSelections: [],
    correctiveActionTrigger: true,
    correctiveActionRequired: true,
    ...overrides,
  };
}

function coolerAttachment(
  overrides?: Partial<LogAttachmentForResolve>,
): LogAttachmentForResolve {
  return {
    id: "att-oct-1",
    stableKey: "cooler_temperature_requirement",
    facilityId: "facility-1",
    departmentId: "dietary",
    catalogStableKey: "cooler_temperature",
    catalogVersion: 3,
    status: "ACTIVE",
    effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-10-14T00:00:00.000Z"),
    timingMode: "DAILY_WINDOWS",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: "Cooler Temperature",
    localInstructions: null,
    targetKind: "OPERATIONAL_TYPE",
    assetId: null,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: "food_service_area",
    resolvedSpaceId: "naval-park",
    dailyWindows: windows("TWICE_DAILY"),
    cycleSelections: [],
    catalogDefinition: {
      id: "cat-v3",
      name: "Cooler Temperature",
      purposeType: "LOG",
      instructions: "Record the cooler.",
      status: "PUBLISHED",
      fields: [
        {
          fieldKey: "temperature",
          label: "Temperature",
          fieldType: "TEMPERATURE",
          isRequired: true,
          displaySequence: 10,
          helpText: null,
          unitLabel: "°F",
          minNumber: 33,
          maxNumber: 41,
          allowedSelections: [],
          correctiveActionTrigger: true,
          correctiveActionRequired: true,
        },
      ],
    },
    ...overrides,
  };
}

const workPlan: PublishedWorkPlanForResolve = {
  id: "plan1",
  stableKey: "walk_in_clean",
  version: 1,
  name: "Clean walk-in",
  status: "PUBLISHED",
  effectiveStartDate: null,
  effectiveEndDate: null,
  weekdays: [],
  applicabilities: [
    {
      kind: "DEPARTMENT_UNIT",
      unitId: "u1",
      spaceId: null,
      spaceType: null,
      assetId: null,
      assetType: null,
    },
  ],
  items: [
    {
      id: "item1",
      itemKey: "clean_walk_in",
      label: "Clean walk-in",
      instructions: null,
      displaySequence: 10,
      priority: "ROUTINE",
      completionMode: "EXPLICIT_CONFIRMATION",
      responsibilityMode: "UNIT_SHARED",
      scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
      cycleStableKeys: [],
      windowStartLocal: null,
      windowEndLocal: null,
      dueOffsetKind: null,
      dueOffsetMinutes: null,
      roleKeys: [],
      unitId: null,
      spaceId: null,
      assetId: null,
      knowledgeArticleId: null,
      procedureTitleSnapshot: null,
      linkedTemplateStableKey: null,
      linkedTemplateId: null,
      supervisorVisible: true,
    },
  ],
};

test("record forms are presentation of one catalog purpose", () => {
  assert.equal(presentRecordForm({ purposeType: "LOG" }), "READING");
  assert.equal(presentRecordForm({ purposeType: "CHECKLIST" }), "CHECKLIST");
  assert.equal(presentRecordForm({ purposeType: "INSPECTION" }), "INSPECTION");
  assert.equal(
    presentRecordForm({ purposeType: "LOG", fieldTypes: ["ATTESTATION"] }),
    "ACKNOWLEDGEMENT",
  );
  assert.equal(presentRecordForm({ purposeType: "LOG", timingMode: "AD_HOC" }), "ON_DEMAND");
  assert.equal(presentRecordForm({ purposeType: "PROCEDURE" }), null);
  assert.equal(recordPurposeRejection("PROCEDURE"), "Procedures are knowledge, not Records.");
  assert.equal(recordPurposeRejection("INSPECTION"), null);
});

test("canonical submission writes one OperationalEvidenceRecord", () => {
  const writer = source("src/lib/canonical-logs/submit-canonical-log.ts");
  assert.match(writer, /operationalEvidenceRecord\.create/);
  assert.doesNotMatch(writer, /logSubmission\.create/);
  assert.doesNotMatch(writer, /inspectionSubmission\.create/);
  assert.doesNotMatch(writer, /inspectionOccurrence\.create/);
  assert.doesNotMatch(writer, /departmentWorkItem\.create/);
  assert.doesNotMatch(writer, /issue\.create/);
  assert.match(writer, /followsRecordId/);
});

test("a checklist is one submission of ordered fields", () => {
  const fields: TemplateFieldSnapshot[] = [
    "sanitizer_prepared",
    "dishwasher_operational",
    "hot_well_heated",
    "refrigerator_checked",
  ].map((fieldKey, index) => ({
    fieldKey,
    label: fieldKey,
    fieldType: "YES_NO" as const,
    isRequired: true,
    displaySequence: (index + 1) * 10,
    helpText: null,
    unitLabel: null,
    minNumber: null,
    maxNumber: null,
    allowedSelections: [],
    correctiveActionTrigger: false,
    correctiveActionRequired: false,
  }));
  const validation = validateEvidenceSubmission({
    fields,
    values: fields.map((field) => ({ fieldKey: field.fieldKey, valueBoolean: true })),
  });
  assert.equal(validation.valid, true);
  assert.equal(Object.keys(validation.fieldOutOfStandard).length, 4);
  assert.equal(presentRecordForm({ purposeType: "CHECKLIST" }), "CHECKLIST");
});

test("inspection is the same record form", () => {
  assert.equal(presentRecordForm({ purposeType: "INSPECTION" }), "INSPECTION");
  const writer = source("src/lib/canonical-logs/submit-canonical-log.ts");
  assert.doesNotMatch(writer, /inspectionSubmission/);
});

test("twice daily through Oct 14 succeeds to three times daily on Oct 15", () => {
  const existing = snap();
  const next = snap({
    dailyWindows: windows("THREE_TIMES_DAILY").map(({ label, startLocal, endLocal }) => ({
      label,
      startLocal,
      endLocal,
    })),
  });
  const classified = classifyAttachmentUpdate({
    effectiveFromKey: "2026-10-01",
    todayKey: "2026-10-14",
    existing,
    next,
    localDisplayLabelChanged: false,
    localInstructionsChanged: false,
    existingStatus: "ACTIVE",
  });
  assert.equal(classified.mode, "SUCCESSOR");
  assert.equal(classified.closeEffectiveToKey, "2026-10-14");
  assert.equal(classified.successorFromKey, "2026-10-15");
  assert.equal(
    attachmentLineageKey({
      catalogStableKey: "cooler_temperature",
      targetKind: "OPERATIONAL_TYPE",
      assetId: null,
      spaceId: null,
      unitId: null,
      targetDepartmentId: null,
      operationalTypeKey: "food_service_area",
      departmentId: "dietary",
    }),
    attachmentLineageKey({
      catalogStableKey: "cooler_temperature",
      targetKind: "OPERATIONAL_TYPE",
      assetId: null,
      spaceId: null,
      unitId: null,
      targetDepartmentId: null,
      operationalTypeKey: "food_service_area",
      departmentId: "dietary",
    }),
  );

  const successor = coolerAttachment({
    id: "att-oct-15",
    effectiveFrom: new Date("2026-10-15T00:00:00.000Z"),
    effectiveTo: null,
    dailyWindows: windows("THREE_TIMES_DAILY"),
  });
  const history = projectLogExpectationHistory({
    segments: [coolerAttachment(), successor],
    fromDateKey: "2026-10-01",
    toDateKey: "2026-10-15",
    todayKey: "2026-10-15",
    now: new Date("2026-10-15T16:00:00.000Z"),
    facilityTimezone: "America/New_York",
    submissions: [],
  });
  const octoberFirst = history.find((day) => day.operationalDateKey === "2026-10-01");
  const octoberFifteenth = history.find((day) => day.operationalDateKey === "2026-10-15");
  assert.equal(octoberFirst?.slots.length, 2);
  assert.equal(octoberFifteenth?.slots.length, 3);
  assert.ok(history.every((day) => day.slots.every((slot) => slot.recordId == null)));
});

test("derived slots do not persist placeholder records", () => {
  const day = projectLogExpectationHistory({
    segments: [
      coolerAttachment({
        effectiveTo: null,
        resolvedSpaceId: "naval-park",
      }),
    ],
    fromDateKey: "2026-10-01",
    toDateKey: "2026-10-01",
    todayKey: "2026-10-01",
    now: new Date("2026-10-01T16:00:00.000Z"),
    facilityTimezone: "America/New_York",
    submissions: [],
  })[0];
  assert.equal(day?.slots.length, 2);
  assert.equal(day?.unscheduledRecords.length, 0);
  const slotKey = buildLogRequirementKey({
    attachmentStableKey: "cooler_temperature_requirement",
    catalogStableKey: "cooler_temperature",
    scheduleKind: "FIXED_DAILY_WINDOW",
    windowStartLocal: day?.slots[0]?.windowStartLocal,
    windowEndLocal: day?.slots[0]?.windowEndLocal,
    target: {
      kind: "OPERATIONAL_TYPE",
      operationalTypeKey: "food_service_area",
      resolvedSpaceId: "naval-park",
    },
    operationalDateKey: "2026-10-01",
  });
  assert.match(slotKey, /cooler_temperature_requirement/);
  assert.match(slotKey, /naval-park|ot:food_service_area/);
});

test("food_service_area slots use the location function binding", () => {
  const assignments = new Map([
    ["naval-park", { key: "food_service_area" }],
    ["labeled-servery", { key: "servery" }],
    ["unassigned", { key: "" }],
  ]);
  assert.deepEqual(expandOperationalTypeSpaces(assignments, "food_service_area"), ["naval-park"]);
  const attachment = {
    id: "att",
    departmentId: "dietary",
    catalogStableKey: "cooler_temperature",
    catalogVersion: 3,
    label: "Cooler Temperature",
    targetKind: "OPERATIONAL_TYPE" as const,
    operationalTypeKey: "food_service_area",
    spaceId: null,
    unitId: null,
    assetId: null,
    targetDepartmentId: null,
    status: "ACTIVE" as const,
  };
  const match = matchLogAttachmentToLocation(attachment, {
    facilityId: "facility-1",
    departmentId: "dietary",
    spaceId: "naval-park",
    unitId: null,
    operationalTypeKey: "food_service_area",
    operationalTypeName: "Kitchen",
  });
  assert.equal(match?.source, "OPERATIONAL_TYPE_DEFAULT");
  assert.equal(
    matchLogAttachmentToLocation(attachment, {
      facilityId: "facility-1",
      departmentId: "dietary",
      spaceId: "labeled-servery",
      unitId: null,
      operationalTypeKey: "servery",
      operationalTypeName: "Food Service Area",
    }),
    null,
  );
});

test("phase timing resolves by stableKey after a label rename", () => {
  const attachment = coolerAttachment({
    timingMode: "OPERATIONAL_CYCLE",
    dailyWindows: [],
    cycleSelections: [{ cycleStableKey: "service_phase", displaySequence: 10 }],
    targetKind: "DEPARTMENT",
    operationalTypeKey: null,
    targetDepartmentId: "dietary",
    resolvedSpaceId: null,
  });
  const cycle = (label: string): PublishedCycleForLogs => ({
    stableKey: "service_phase",
    label,
    startLocal: "11:00",
    endLocal: "13:00",
    overnight: false,
    startsAt: new Date("2026-10-01T15:00:00.000Z"),
    endsAt: new Date("2026-10-01T17:00:00.000Z"),
  });
  const first = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-10-01",
    now: new Date("2026-10-01T16:00:00.000Z"),
    facilityTimezone: "America/New_York",
    publishedCycles: [cycle("Service")],
    existingRecords: [],
  });
  const renamed = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-10-01",
    now: new Date("2026-10-01T16:00:00.000Z"),
    facilityTimezone: "America/New_York",
    publishedCycles: [cycle("Meal Service")],
    existingRecords: [],
  });
  assert.equal(first[0]?.productState === "NEEDS_SETUP", false);
  assert.equal(first[0]?.requirementKey, renamed[0]?.requirementKey);
  assert.equal(renamed[0]?.cycleStableKey, "service_phase");

  const keyPoint = resolveLogRequirementsForAttachment({
    attachment: coolerAttachment({
      timingMode: "OPERATIONAL_CYCLE",
      dailyWindows: [],
      cycleSelections: [{ cycleStableKey: "breakfast_ready", displaySequence: 10 }],
      targetKind: "DEPARTMENT",
      operationalTypeKey: null,
      targetDepartmentId: "dietary",
    }),
    operationalDateKey: "2026-10-01",
    now: new Date("2026-10-01T16:00:00.000Z"),
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(keyPoint[0]?.productState, "NEEDS_SETUP");
  assert.match(source("src/lib/canonical-logs/load-published-cycles-for-logs.ts"), /nodeKind: "PERIOD"/);
});

test("a submitted standard snapshot stays out of range after the definition widens", () => {
  const submitted = pinSubmittedStandard({
    definitionVersion: 3,
    minNumber: 33,
    maxNumber: 41,
    valueNumber: 43,
  });
  const laterDefinition = { minNumber: 33, maxNumber: 45, version: 4 };
  assert.equal(submitted.outOfStandard, true);
  assert.equal(submitted.maxNumber, 41);
  assert.equal(submitted.definitionVersion, 3);
  assert.notEqual(submitted.maxNumber, laterDefinition.maxNumber);
});

test("out of range corrective action is required and does not create an issue", () => {
  const missing = validateEvidenceSubmission({
    fields: [temperatureField()],
    values: [{ fieldKey: "temperature", valueNumber: 45 }],
  });
  assert.equal(missing.valid, false);
  assert.equal(missing.outOfStandard, true);
  assert.equal(missing.correctiveActionRequired, true);
  const accepted = validateEvidenceSubmission({
    fields: [temperatureField()],
    values: [{ fieldKey: "temperature", valueNumber: 45 }],
    correctiveActionText: "Door had been left open. Closed door. Recheck required.",
  });
  assert.equal(accepted.valid, true);
  assert.equal(accepted.outOfStandard, true);
  assert.doesNotMatch(source("src/lib/canonical-logs/submit-canonical-log.ts"), /issue\.create/);
});

test("follow-up is a second record linked to the original", () => {
  const linked = followUpRecordDecision({
    originStableKey: "cooler_temperature",
    nextStableKey: "cooler_temperature",
    originId: "record-704",
    nextId: "record-736",
  });
  assert.equal(linked.ok, true);
  const replaced = followUpRecordDecision({
    originStableKey: "cooler_temperature",
    nextStableKey: "cooler_temperature",
    originId: "record-704",
    nextId: "record-704",
  });
  assert.equal(replaced.ok, false);
  const writer = source("src/lib/canonical-logs/submit-canonical-log.ts");
  assert.match(writer, /followsRecordId/);
  assert.match(source("prisma/schema.prisma"), /followsRecordId/);
});

test("correction keeps the original occurrence and appends the previous value", () => {
  const correction = source("src/lib/operational-evidence/correct-evidence.ts");
  assert.match(correction, /operationalEvidenceCorrection\.create/);
  assert.match(correction, /previousValuesJson/);
  assert.match(correction, /previousStatus/);
  assert.doesNotMatch(correction, /operationalEvidenceRecord\.delete/);
  assert.doesNotMatch(correction, /followsRecordId/);
});

test("linked evidence completes work only when the work item points at the record", () => {
  const base = {
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-10-01",
    now: new Date("2026-10-01T16:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "e1", unitId: "u1", roleKey: null }],
    existingOccurrences: [],
    acceptedEvidence: [
      {
        id: "ev1",
        templateStableKey: "cooler_temperature",
        templateId: null,
        unitId: "u1",
        status: "COMPLETED" as const,
      },
    ],
  };
  const unlinked = resolveWorkRequirements({
    ...base,
    publishedPlans: [workPlan],
  });
  assert.notEqual(unlinked[0]?.state, "COMPLETED_WITH_EVIDENCE");
  const linked = resolveWorkRequirements({
    ...base,
    publishedPlans: [
      {
        ...workPlan,
        items: [
          {
            ...workPlan.items[0]!,
            completionMode: "LINKED_EVIDENCE",
            linkedTemplateStableKey: "cooler_temperature",
          },
        ],
      },
    ],
  });
  assert.equal(linked[0]?.state, "COMPLETED_WITH_EVIDENCE");
  assert.equal(linked[0]?.evidenceRecordId, "ev1");
  assert.equal(linked.length, 1);
});

test("legacy writers are blocked only while the product record engine is on", () => {
  assert.equal(
    legacyRecordWriteDecision({ productRecordEngine: false, writer: "LOG_SUBMISSION" }).allowed,
    true,
  );
  const blocked = legacyRecordWriteDecision({
    productRecordEngine: true,
    writer: "INSPECTION_SUBMISSION",
  });
  assert.equal(blocked.allowed, false);
  assert.match(source("src/app/(protected)/logs/actions.ts"), /LOG_SUBMISSION/);
  assert.match(source("src/app/(protected)/unit/[unitId]/actions.ts"), /INSPECTION_SUBMISSION/);
  assert.match(source("src/lib/work/inspections/generate-due-inspection-work.ts"), /isCanonicalLogsEnabled/);
  assert.match(source("src/app/(protected)/staffing/templates/actions.ts"), /OPERATIONAL_TEMPLATE/);
});

test("historical log and inspection models stay in place", () => {
  const schema = source("prisma/schema.prisma");
  assert.match(schema, /model LogSubmission/);
  assert.match(schema, /model InspectionSubmission/);
  assert.match(schema, /model InspectionOccurrence/);
  assert.match(schema, /model OperationalTemplate/);
  assert.match(schema, /waiverAllowed/);
  assert.doesNotMatch(source("src/lib/canonical-logs/record-engine.ts"), /waiver\.create/);
  assert.doesNotMatch(schema, /model OperationalEvidenceRecord[\s\S]*Attachment\s+Attachment/);
});

test("procedure install is not a record requirement", () => {
  const install = source("src/lib/canonical-logs/facility-catalog-install.ts");
  assert.match(install, /PROCEDURE/);
  assert.match(install, /recordPurposeRejection/);
  assert.match(install, /INSPECTION/);
});
