"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { assertLegacyRecordWriteAllowed } from "@/lib/canonical-logs/record-engine";
import { departmentUsesCanonicalRecords } from "@/lib/canonical-logs/record-engine-store";
import { isDepartmentEngineEnabledForFacility } from "@/lib/department-operations";
import { prisma } from "@/lib/prisma";
import {
  submitEvidenceRecord,
  type EvidenceFieldValueInput,
} from "@/lib/operational-evidence";

export async function submitUnitEvidenceAction(input: {
  facilityId: string;
  departmentId: string;
  unitId: string;
  templateId: string;
  requirementKey: string;
  operationalDateKey: string;
  scheduleKind: "OPERATIONAL_CYCLE" | "FIXED_DAILY_WINDOW" | "ONCE_PER_OPERATIONAL_DATE" | "AD_HOC";
  cycleStableKey?: string | null;
  cycleLabel?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  spaceId?: string | null;
  assetId?: string | null;
  values: EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
  occurredAt?: string | null;
  clientCommandId?: string | null;
}) {
  const session = await getSession();
  if (!session || session.facilityId !== input.facilityId) throw new Error("Authentication required.");
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { key: true },
  });
  if (!department || !(await isDepartmentEngineEnabledForFacility(input.facilityId, "evidence", department.key, session))) {
    throw new Error("Operational Evidence is not enabled for this department.");
  }
  assertLegacyRecordWriteAllowed({
    productRecordEngine: await departmentUsesCanonicalRecords({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.operationalDateKey,
    }),
    writer: "OPERATIONAL_TEMPLATE",
  });
  const record = await submitEvidenceRecord(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    templateId: input.templateId,
    requirementKey: input.requirementKey,
    operationalDateKey: input.operationalDateKey,
    scheduleKind: input.scheduleKind,
    cycleStableKey: input.cycleStableKey,
    cycleLabel: input.cycleLabel,
    windowStartLocal: input.windowStartLocal,
    windowEndLocal: input.windowEndLocal,
    unitId: input.unitId,
    spaceId: input.spaceId,
    assetId: input.assetId,
    values: input.values,
    correctiveActionText: input.correctiveActionText,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    recordedOnline: true,
    clientCommandId: input.clientCommandId ?? null,
    recordedByLabel: session.name || session.email || null,
  });

  revalidatePath(`/unit/${input.unitId}`);
  revalidatePath("/staffing/operations");
  revalidatePath("/staffing/log-book");
  return { id: record.id, status: record.status };
}
