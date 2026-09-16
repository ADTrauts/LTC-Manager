"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { submitCanonicalLogSubmission } from "@/lib/canonical-logs";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import type { EvidenceFieldValueInput } from "@/lib/operational-evidence/types";
import { prisma } from "@/lib/prisma";

export type SubmitCanonicalRunLogResult =
  | {
      ok: true;
      recordId: string;
      exception: boolean;
      redirectTo: string;
    }
  | { ok: false; error: string; existingRecordId?: string };

export async function submitCanonicalRunLogAction(input: {
  facilityId: string;
  departmentId: string;
  logAttachmentId: string;
  requirementKey?: string | null;
  operationalDateKey: string;
  cycleStableKey?: string | null;
  cycleLabel?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  values: EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
  adHoc?: boolean;
  clientCommandId?: string | null;
  deviceBoundUnitId?: string | null;
}): Promise<SubmitCanonicalRunLogResult> {
  if (!isCanonicalLogsEnabled()) {
    return { ok: false, error: "Canonical Logs are not enabled." };
  }

  const session = await getSession();
  if (!session?.facilityId) return { ok: false, error: "Not signed in." };
  if (session.facilityId !== input.facilityId) {
    return { ok: false, error: "Cross-facility Log submission denied." };
  }

  try {
    const record = await submitCanonicalLogSubmission(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      logAttachmentId: input.logAttachmentId,
      requirementKey: input.requirementKey,
      operationalDateKey: input.operationalDateKey,
      cycleStableKey: input.cycleStableKey,
      cycleLabel: input.cycleLabel,
      windowStartLocal: input.windowStartLocal,
      windowEndLocal: input.windowEndLocal,
      occurredAt: new Date(),
      values: input.values,
      correctiveActionText: input.correctiveActionText,
      adHoc: input.adHoc === true,
      clientCommandId: input.clientCommandId,
      deviceBoundUnitId: input.deviceBoundUnitId,
      recordedByEmployeeId:
        session.authKind === "employee" ? session.uid : null,
      recordedByLabel: session.name,
    });

    revalidatePath("/staffing/logs");
    revalidatePath("/staffing/log-book");

    const exception =
      record.status === "COMPLETED_WITH_CORRECTIVE_ACTION" ||
      record.status === "NEEDS_REVIEW" ||
      record.outOfStandard;

    return {
      ok: true,
      recordId: record.id,
      exception,
      redirectTo: `/staffing/logs/records/${record.id}?justCompleted=1`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not submit Log.";
    if (/already been completed/i.test(message)) {
      const existing = await prisma.operationalEvidenceRecord.findFirst({
        where: {
          facilityId: input.facilityId,
          OR: [
            { logRequirementKey: input.requirementKey ?? undefined },
            { requirementKey: input.requirementKey ?? undefined },
          ],
        },
        select: { id: true },
        orderBy: { recordedAt: "desc" },
      });
      return {
        ok: false,
        error: "This Log has already been completed.",
        existingRecordId: existing?.id,
      };
    }
    return { ok: false, error: message };
  }
}
