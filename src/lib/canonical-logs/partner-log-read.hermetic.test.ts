import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { FacilitySession } from "@/lib/auth";
import { loadFacilityRunLogRequirements } from "@/lib/canonical-logs/load-run-requirements";
import { loadPartnerRunLogRecord, loadPartnerRunLogRequirements } from "@/lib/canonical-logs/partner-log-read";
import { submitCanonicalLogSubmission } from "@/lib/canonical-logs/submit-canonical-log";
import { correctEvidenceRecord } from "@/lib/operational-evidence/correct-evidence";
import { canPartner } from "@/lib/partner-user-access";
import { partnerShellReturnPath, type PartnerOperationalContext } from "@/lib/partner-operational-context";

process.env.CANONICAL_LOGS_ENABLED = "true";

function context(overrides: Partial<PartnerOperationalContext> = {}): PartnerOperationalContext {
  return {
    accessKind: "partner",
    userId: "jane",
    facilityId: "terrace",
    partnerOrganizationId: "metz",
    facilityPartnerOrganizationId: "metz-terrace",
    assignedRole: "PARTNER_VIEWER",
    facilityRoleCeiling: "PARTNER_MANAGER",
    effectiveRole: "PARTNER_VIEWER",
    allowedDepartmentIds: ["food"],
    activeDepartmentId: "food",
    ...overrides,
  };
}

function attachment(input: { id: string; facilityId: string; departmentId: string; name: string }) {
  return {
    ...input,
    stableKey: input.id,
    catalogStableKey: "catalog",
    catalogVersion: 1,
    status: "ACTIVE",
    effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: input.name,
    localInstructions: null,
    targetKind: "FACILITY",
    assetId: null,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    dailyWindows: [{ label: "Day", startLocal: "00:00", endLocal: "23:59", displaySequence: 1 }],
    cycleSelections: [],
    catalogDefinition: {
      id: "catalog",
      name: input.name,
      purposeType: "TEMPERATURE",
      instructions: null,
      status: "PUBLISHED",
      fields: [],
    },
  };
}

function record(input: { id: string; facilityId: string; departmentId: string; name: string }) {
  return {
    id: input.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    logAttachmentId: "att",
    templateName: input.name,
    templateVersion: 1,
    status: "COMPLETED",
    outOfStandard: false,
    correctiveActionText: "Moved the food",
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
    templateSnapshotJson: null,
    department: { name: input.name },
    values: [],
    corrections: [],
  };
}

function matches(row: { facilityId?: string; departmentId?: string; id?: string; logAttachmentId?: string }, where: Record<string, unknown> | undefined) {
  if (!where) return true;
  if (typeof where.facilityId === "string" && row.facilityId !== where.facilityId) return false;
  if (typeof where.departmentId === "string" && row.departmentId !== where.departmentId) return false;
  if (where.departmentId && typeof where.departmentId === "object" && "not" in where.departmentId) {
    if (row.departmentId === (where.departmentId as { not: string }).not) return false;
  }
  if (typeof where.id === "string" && row.id !== where.id) return false;
  if (where.logAttachmentId && typeof where.logAttachmentId === "object" && "in" in where.logAttachmentId) {
    const ids = (where.logAttachmentId as { in: string[] }).in;
    if (!row.logAttachmentId || !ids.includes(row.logAttachmentId)) return false;
  }
  return true;
}

function fakeClient(attachments: ReturnType<typeof attachment>[], records: ReturnType<typeof record>[]) {
  const wheres: unknown[] = [];
  const client = {
    facility: { findUnique: async () => ({ timezone: "UTC" }) },
    logAttachment: {
      findMany: async ({ where }: { where?: Record<string, unknown> }) => {
        wheres.push(where);
        return attachments.filter((row) => matches(row, where));
      },
    },
    operationalEvidenceRecord: {
      findMany: async ({ where }: { where?: Record<string, unknown> }) => {
        wheres.push(where);
        return records.filter((row) => matches(row, where));
      },
      findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
        wheres.push(where);
        return records.find((row) => matches(row, where)) ?? null;
      },
    },
    departmentOperationalCycle: { findMany: async () => [] },
    unitSpace: { findMany: async () => [], findFirst: async () => null },
    asset: { findFirst: async () => null },
    department: { findFirst: async () => null },
  };
  return { client: client as never, wheres };
}

const attachments = [
  attachment({ id: "cooler", facilityId: "terrace", departmentId: "food", name: "Cooler log" }),
  attachment({ id: "dishwasher", facilityId: "terrace", departmentId: "food", name: "Dishwasher log" }),
  attachment({ id: "cleaning", facilityId: "terrace", departmentId: "evs", name: "Cleaning log" }),
  attachment({ id: "hp", facilityId: "highpointe", departmentId: "food", name: "Temperature log" }),
];

test("partner log list is the active department at the current facility", async () => {
  const { client, wheres } = fakeClient(attachments, []);
  const food = await loadPartnerRunLogRequirements({ client, context: context() });
  assert.deepEqual(
    food.requirements.map((row) => row.displayName).sort(),
    ["Cooler log", "Dishwasher log"],
  );
  assert.equal(food.requirements.some((row) => row.openHref), false);
  assert.equal(food.adHocAttachments.some((row) => row.startHref), false);
  assert.equal(
    wheres.some((where) => JSON.stringify(where).includes("Cleaning log")),
    false,
  );

  const evs = await loadPartnerRunLogRequirements({
    client,
    context: context({
      effectiveRole: "PARTNER_MANAGER",
      allowedDepartmentIds: ["food", "evs"],
      activeDepartmentId: "evs",
    }),
  });
  assert.deepEqual(
    evs.requirements.map((row) => row.displayName),
    ["Cleaning log"],
  );

  const highpointe = await loadPartnerRunLogRequirements({
    client,
    context: context({ facilityId: "highpointe", facilityPartnerOrganizationId: "metz-hp" }),
  });
  assert.deepEqual(
    highpointe.requirements.map((row) => row.displayName),
    ["Temperature log"],
  );
});

test("partner roles see the same department records and cannot omit the department", async () => {
  const { client } = fakeClient(attachments, []);
  const names = new Map<string, string[]>();
  for (const effectiveRole of ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER"] as const) {
    const bundle = await loadPartnerRunLogRequirements({
      client,
      context: context({ effectiveRole }),
    });
    names.set(
      effectiveRole,
      bundle.requirements.map((row) => row.displayName).sort(),
    );
  }
  assert.deepEqual(names.get("PARTNER_VIEWER"), names.get("PARTNER_OPERATOR"));
  assert.deepEqual(names.get("PARTNER_OPERATOR"), names.get("PARTNER_MANAGER"));

  await assert.rejects(
    () =>
      loadFacilityRunLogRequirements({
        client,
        facilityId: "terrace",
        departmentId: undefined as never,
        partnerRead: true,
      }),
    /require a Department/,
  );
});

test("stale department and empty scope do not load that department", async () => {
  const { client, wheres } = fakeClient(attachments, []);
  const reduced = await loadPartnerRunLogRequirements({
    client,
    context: context({ allowedDepartmentIds: ["food"], activeDepartmentId: "food" }),
  });
  assert.equal(reduced.requirements.some((row) => row.displayName === "Cleaning log"), false);

  await assert.rejects(
    () =>
      loadPartnerRunLogRequirements({
        client,
        context: context({ allowedDepartmentIds: ["food"], activeDepartmentId: "evs" }),
      }),
    /require a Department/,
  );
  assert.equal(wheres.some((where) => JSON.stringify(where).includes('"departmentId":"evs"')), false);
});

test("partner record lookup is facility and active department", async () => {
  const records = [
    record({ id: "food-rec", facilityId: "terrace", departmentId: "food", name: "Cooler log" }),
    record({ id: "evs-rec", facilityId: "terrace", departmentId: "evs", name: "Cleaning log" }),
    record({ id: "hp-rec", facilityId: "highpointe", departmentId: "food", name: "Temperature log" }),
  ];
  const { client } = fakeClient([], records);
  const food = await loadPartnerRunLogRecord({ client, context: context(), recordId: "food-rec" });
  assert.equal(food?.displayName, "Cooler log");
  assert.equal(food?.correctiveActionText, "Moved the food");

  assert.equal(
    await loadPartnerRunLogRecord({ client, context: context(), recordId: "evs-rec" }),
    null,
  );
  assert.equal(
    await loadPartnerRunLogRecord({ client, context: context(), recordId: "hp-rec" }),
    null,
  );
  assert.equal(
    await loadPartnerRunLogRecord({ client, context: context(), recordId: "missing" }),
    null,
  );

  const otherPartnership = await loadPartnerRunLogRecord({
    client,
    context: context({
      partnerOrganizationId: "otherco",
      facilityPartnerOrganizationId: "otherco-terrace",
      allowedDepartmentIds: ["evs"],
      activeDepartmentId: "evs",
    }),
    recordId: "food-rec",
  });
  assert.equal(otherPartnership, null);
});

test("partner sessions cannot submit or correct canonical logs", async () => {
  const partner = {
    accessKind: "partner",
    role: undefined,
    scopeKind: "facility",
    authKind: "user",
    facilityId: "terrace",
    uid: "jane",
    name: "Jane",
    email: "jane@example.com",
    sessionVersion: 0,
  } as unknown as FacilitySession;
  for (const role of ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER"] as const) {
    assert.equal(canPartner(role, "logs.read"), true);
    await assert.rejects(() => submitCanonicalLogSubmission(partner, {} as never), /cannot submit/);
    await assert.rejects(() => correctEvidenceRecord(partner, {} as never), /cannot correct/);
  }
});

test("partner log return path is allowlisted", () => {
  assert.equal(partnerShellReturnPath("/partner/logs"), "/partner/logs");
  assert.equal(partnerShellReturnPath("/partner"), "/partner");
  assert.equal(partnerShellReturnPath("/staffing/logs"), "/partner");
  assert.equal(partnerShellReturnPath("https://evil.example/partner/logs"), "/partner");
  const root = process.cwd();
  const page = readFileSync(join(root, "src/app/partner/logs/page.tsx"), "utf8");
  const recordPage = readFileSync(join(root, "src/app/partner/logs/records/[recordId]/page.tsx"), "utf8");
  const reader = readFileSync(join(root, "src/lib/canonical-logs/partner-log-read.ts"), "utf8");
  for (const source of [page, recordPage, reader]) {
    assert.equal(source.includes("getSession("), false);
    assert.equal(source.includes("employee.find"), false);
    assert.equal(source.includes("/logs"), source.includes("/partner/logs") ? source.includes("/partner/logs") : false);
  }
  assert.equal(reader.includes("submitCanonicalLogSubmission"), false);
});
