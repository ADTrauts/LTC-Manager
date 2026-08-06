"use server";

import { revalidatePath } from "next/cache";

import { getSession, sessionUserIdForFk } from "@/lib/auth";
import { isDietaryOperationalEvidenceEnabled } from "@/lib/feature-flags";
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
  if (!isDietaryOperationalEvidenceEnabled()) {
    throw new Error("Dietary Operational Evidence is not enabled.");
  }
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");

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
