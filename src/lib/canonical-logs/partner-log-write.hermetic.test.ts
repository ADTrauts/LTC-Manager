import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { FacilitySession } from "@/lib/auth";
import {
  correctPartnerCanonicalLog,
  submitPartnerCanonicalLog,
} from "@/lib/canonical-logs/partner-log-write";
import { loadPartnerRunLogRecord } from "@/lib/canonical-logs/partner-log-read";
import { submitCanonicalLogSubmission } from "@/lib/canonical-logs/submit-canonical-log";
import { correctEvidenceRecord } from "@/lib/operational-evidence/correct-evidence";
import type { PartnerOperationalContext } from "@/lib/partner-operational-context";

process.env.CANONICAL_LOGS_ENABLED = "true";

function context(overrides: Partial<PartnerOperationalContext> = {}): PartnerOperationalContext {
  return {
    accessKind: "partner",
    userId: "jane",
    facilityId: "terrace",
    partnerOrganizationId: "metz",
    facilityPartnerOrganizationId: "metz-terrace",
    assignedRole: "PARTNER_OPERATOR",
    facilityRoleCeiling: "PARTNER_MANAGER",
    effectiveRole: "PARTNER_OPERATOR",
    allowedDepartmentIds: ["food"],
    activeDepartmentId: "food",
    ...overrides,
  };
}

function attachment(input: { id: string; facilityId: string; departmentId: string }) {
  return {
    ...input,
    stableKey: input.id,
    catalogDefinitionId: "cat",
    effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    effectiveTo: null,
    status: "ACTIVE",
    localDisplayLabel: "Cooler log",
    localInstructions: null,
    timingMode: "DAILY_WINDOWS",
    targetKind: "FACILITY",
    assetId: null,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    dailyWindows: [],
    cycleSelections: [],
    catalogDefinition: {
      id: "cat",
      stableKey: "cooler",
      version: 1,
      name: "Cooler log",
      description: null,
      instructions: null,
      purposeType: "TEMPERATURE",
      category: "SAFETY",
      recommendedCadence: null,
      status: "PUBLISHED",
      fields: [],
    },
  };
}

const attachments = [
  attachment({ id: "cooler", facilityId: "terrace", departmentId: "food" }),
  attachment({ id: "cleaning", facilityId: "terrace", departmentId: "evs" }),
  attachment({ id: "hp", facilityId: "highpointe", departmentId: "food" }),
];

function matchesAttachment(row: { id: string; facilityId: string; departmentId: string }, where: Record<string, unknown>) {
  if (where.id !== row.id) return false;
  if (where.facilityId !== row.facilityId) return false;
  if (typeof where.departmentId === "string" && where.departmentId !== row.departmentId) return false;
  return true;
}

function world() {
  const created: Array<Record<string, unknown>> = [];
  const corrections: Array<Record<string, unknown>> = [];
  const evidence = [
    {
      id: "food-rec",
      facilityId: "terrace",
      departmentId: "food",
      status: "COMPLETED",
      correctiveActionText: null,
      outOfStandard: false,
      templateName: "Cooler log",
      templateVersion: 1,
      occurredAt: new Date("2026-10-08T15:00:00.000Z"),
      recordedAt: new Date("2026-10-08T15:00:00.000Z"),
      recordedByLabel: "Alex",
      operationalDate: new Date("2026-10-08T00:00:00.000Z"),
      cycleLabel: null,
      windowStartLocal: null,
      windowEndLocal: null,
      unitId: null,
      spaceId: null,
      assetId: null,
      templateSnapshotJson: {
        fields: [
          {
            fieldKey: "note",
            label: "Note",
            fieldType: "SHORT_TEXT",
            isRequired: false,
            displaySequence: 1,
            helpText: null,
            unitLabel: null,
            minNumber: null,
            maxNumber: null,
            allowedSelections: [],
            correctiveActionTrigger: false,
            correctiveActionRequired: false,
          },
        ],
      },
      department: { name: "Food & Nutrition" },
      values: [],
      corrections: [],
    },
    {
      id: "evs-rec",
      facilityId: "terrace",
      departmentId: "evs",
      status: "COMPLETED",
      values: [],
      templateSnapshotJson: { fields: [] },
    },
    {
      id: "hp-rec",
      facilityId: "highpointe",
      departmentId: "food",
      status: "COMPLETED",
      values: [],
      templateSnapshotJson: { fields: [] },
    },
  ];

  const client = {
    logAttachment: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        attachments.find((row) => matchesAttachment(row, where)) ?? null,
    },
    operationalEvidenceRecord: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const rows = [...evidence, ...created] as Array<Record<string, unknown>>;
        if (typeof where.id === "string") {
          return (
            rows.find(
              (row) =>
                row.id === where.id &&
                row.facilityId === where.facilityId &&
                (where.departmentId == null || row.departmentId === where.departmentId),
            ) ?? null
          );
        }
        const keys = Array.isArray(where.OR)
          ? where.OR.flatMap((item) => Object.values(item as Record<string, unknown>))
          : [];
        return (
          rows.find(
            (row) =>
              row.facilityId === where.facilityId &&
              keys.some((key) => key && (row.requirementKey === key || row.logRequirementKey === key)),
          ) ?? null
        );
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...data,
          templateName: data.templateName,
          department: { name: "Food & Nutrition" },
          values: [],
          corrections: [],
          templateSnapshotJson: null,
          occurredAt: data.occurredAt,
          recordedByLabel: data.recordedByLabel,
          operationalDate: data.operationalDate,
          cycleLabel: null,
          windowStartLocal: null,
          windowEndLocal: null,
          unitId: null,
          spaceId: null,
          assetId: null,
        };
        created.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = evidence.find((item) => item.id === where.id) ?? created.find((item) => item.id === where.id);
        return { ...(row ?? { id: where.id }), ...data, corrections };
      },
    },
    operationalEvidenceCorrection: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        corrections.push(data);
        return data;
      },
    },
    operationalEvidenceFieldValue: { deleteMany: async () => ({ count: 0 }) },
    unitSpace: { findFirst: async () => null },
  };

  return { client: client as never, created, corrections, evidence };
}

const submitBase = {
  logAttachmentId: "cooler",
  requirementKey: "req-cooler",
  operationalDateKey: "2026-10-08",
  values: [],
  actorLabel: "Jane Smith",
  now: new Date("2026-10-08T15:00:00.000Z"),
};

test("partner submit follows role and active department", async () => {
  const denied = world();
  await assert.rejects(
    () =>
      submitPartnerCanonicalLog({
        ...submitBase,
        client: denied.client,
        context: context({ effectiveRole: "PARTNER_VIEWER", assignedRole: "PARTNER_VIEWER" }),
      }),
    /submission denied/,
  );
  assert.equal(denied.created.length, 0);

  for (const effectiveRole of ["PARTNER_OPERATOR", "PARTNER_MANAGER"] as const) {
    const { client, created } = world();
    const record = await submitPartnerCanonicalLog({
      ...submitBase,
      client,
      context: context({ effectiveRole, assignedRole: effectiveRole }),
    });
    assert.equal(record.recordedByUserId, "jane");
    assert.equal(record.recordedByEmployeeId, null);
    assert.equal(record.facilityId, "terrace");
    assert.equal(record.departmentId, "food");
    assert.equal(created.length, 1);
    const viewed = await loadPartnerRunLogRecord({
      client,
      context: context({ effectiveRole, assignedRole: effectiveRole }),
      recordId: String(record.id),
    });
    assert.equal(viewed?.displayName, "Cooler log");
  }
});

test("partner submit denies other departments, facilities, and stale authority", async () => {
  const { client, created } = world();
  for (const logAttachmentId of ["cleaning", "hp", "missing"]) {
    await assert.rejects(
      () =>
        submitPartnerCanonicalLog({
          ...submitBase,
          client,
          context: context(),
          logAttachmentId,
        }),
      /Log not found/,
    );
  }
  await assert.rejects(
    () =>
      submitPartnerCanonicalLog({
        ...submitBase,
        client,
        context: context({ effectiveRole: "PARTNER_VIEWER", assignedRole: "PARTNER_VIEWER" }),
      }),
    /submission denied/,
  );
  await assert.rejects(
    () =>
      submitPartnerCanonicalLog({
        ...submitBase,
        client,
        context: context({ allowedDepartmentIds: ["evs"], activeDepartmentId: "evs" }),
      }),
    /Log not found/,
  );
  assert.equal(created.length, 0);
});

test("partner correction is manager-only and stays on the active department record", async () => {
  const viewer = world();
  await assert.rejects(
    () =>
      correctPartnerCanonicalLog({
        client: viewer.client,
        context: context({ effectiveRole: "PARTNER_VIEWER", assignedRole: "PARTNER_VIEWER" }),
        actorLabel: "Jane Smith",
        recordId: "food-rec",
        reason: "Retest",
        values: [{ fieldKey: "note", valueText: "41" }],
      }),
    /correction denied/,
  );
  const operator = world();
  await assert.rejects(
    () =>
      correctPartnerCanonicalLog({
        client: operator.client,
        context: context(),
        actorLabel: "Jane Smith",
        recordId: "food-rec",
        reason: "Retest",
        values: [{ fieldKey: "note", valueText: "41" }],
      }),
    /correction denied/,
  );
  assert.equal(operator.corrections.length, 0);

  const manager = world();
  await correctPartnerCanonicalLog({
    client: manager.client,
    context: context({ effectiveRole: "PARTNER_MANAGER", assignedRole: "PARTNER_MANAGER" }),
    actorLabel: "Jane Smith",
    recordId: "food-rec",
    reason: "Retest",
    values: [{ fieldKey: "note", valueText: "41" }],
  });
  assert.equal(manager.corrections.length, 1);
  assert.equal(manager.corrections[0]?.correctedByUserId, "jane");
  assert.equal(manager.corrections[0]?.correctedByEmployeeId, null);
  assert.equal(manager.corrections[0]?.reason, "Retest");
  assert.equal((manager.corrections[0]?.previousValuesJson as { status: string }).status, "COMPLETED");

  await assert.rejects(
    () =>
      correctPartnerCanonicalLog({
        client: manager.client,
        context: context({ effectiveRole: "PARTNER_OPERATOR", assignedRole: "PARTNER_OPERATOR" }),
        actorLabel: "Jane Smith",
        recordId: "food-rec",
        reason: "Too late",
        values: [{ fieldKey: "note", valueText: "41" }],
      }),
    /correction denied/,
  );

  for (const recordId of ["evs-rec", "hp-rec", "missing"]) {
    await assert.rejects(
      () =>
        correctPartnerCanonicalLog({
          client: manager.client,
          context: context({ effectiveRole: "PARTNER_MANAGER", assignedRole: "PARTNER_MANAGER" }),
          actorLabel: "Jane Smith",
          recordId,
          reason: "Nope",
          values: [],
        }),
      /Log not found/,
    );
  }
});

test("partner sessions still cannot use the internal mutation entry", async () => {
  const partner = {
    accessKind: "partner",
    role: undefined,
    uid: "jane",
    name: "Jane",
  } as unknown as FacilitySession;
  await assert.rejects(() => submitCanonicalLogSubmission(partner, {} as never), /cannot submit/);
  await assert.rejects(() => correctEvidenceRecord(partner, {} as never), /cannot correct/);
  const action = readFileSync(join(process.cwd(), "src/app/partner/logs/actions.ts"), "utf8");
  assert.match(action, /requirePartnerOperationalContext/);
  assert.equal(action.includes("facilityId:"), false);
  assert.equal(action.includes("departmentId:"), false);
});
