"use server";

import { revalidatePath } from "next/cache";

import { createOperationalRecordWaiver } from "@/lib/audit/create-waiver";
import { sessionUserIdForFk } from "@/lib/auth";
import { requireFacilitySession } from "@/lib/facility-context";
import { requireEvidenceSubmit, resolveEvidenceAuthority } from "@/lib/operational-evidence/evidence-authority";
import { prisma } from "@/lib/prisma";

export async function createRecordWaiverAction(formData: FormData): Promise<void> {
  const session = await requireFacilitySession();
  const departmentId = String(formData.get("departmentId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  let parsed: {
    logAttachmentId?: string;
    operationalDateKey?: string;
    requirementKey?: string;
  };
  try {
    parsed = JSON.parse(String(formData.get("slot") ?? "{}")) as {
    logAttachmentId?: string;
    operationalDateKey?: string;
    requirementKey?: string;
  };
  } catch {
    throw new Error("Choose a slot to waive.");
  }
  const logAttachmentId = parsed.logAttachmentId ?? "";
  const operationalDateKey = parsed.operationalDateKey ?? "";
  const requirementKey = parsed.requirementKey ?? "";
  if (!departmentId || !logAttachmentId || !operationalDateKey || !requirementKey) {
    throw new Error("Choose a slot to waive.");
  }
  const authority = await resolveEvidenceAuthority(session, session.facilityId, departmentId);
  requireEvidenceSubmit(authority);
  await createOperationalRecordWaiver(prisma, {
    facilityId: session.facilityId,
    departmentId,
    logAttachmentId,
    requirementKey,
    operationalDateKey,
    reason,
    actorMaySubmit: true,
    recordedByUserId: sessionUserIdForFk(session),
    recordedByLabel: session.name || session.email || null,
  });
  revalidatePath("/reports");
}
