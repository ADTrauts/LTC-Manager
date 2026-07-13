"use server";

import { hasAtLeastRole } from "@/lib/access";
import { getOrGenerateRecoveryAssistant } from "@/lib/ai/recovery-assistant";
import type { RecoveryAssistantView } from "@/lib/ai/recovery-assistant/types";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { departmentFilterIdsForSession } from "@/lib/department-scope";
import { requireFacilitySession } from "@/lib/facility-context";
import { isAiRecoveryAssistantEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export type RecoveryAssistantActionResult =
  | { ok: true; guidance: RecoveryAssistantView }
  | { ok: false; message: string };

function parseDepartmentKey(value: unknown): OperationalDepartmentKey | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  if (key === "DIETARY" || key === "EVS" || key === "PLANT") return key;
  return null;
}

/** Manager+ may trigger provider generation. Facility-scoped; issue must belong to session facility. */
export async function refreshRecoveryAssistantAction(input: {
  issueId: string;
  departmentKey?: string | null;
  forceRefresh?: boolean;
}): Promise<RecoveryAssistantActionResult> {
  try {
    const session = await requireFacilitySession();
    if (!hasAtLeastRole(session.role, "MANAGER")) {
      return { ok: false, message: "Only managers can refresh Recovery Assistant." };
    }
    if (!isAiRecoveryAssistantEnabled()) {
      return { ok: false, message: "Recovery Assistant AI is disabled." };
    }

    const issueId = typeof input.issueId === "string" ? input.issueId.trim() : "";
    if (!issueId) {
      return { ok: false, message: "Issue id is required." };
    }

    const issue = await prisma.repair.findFirst({
      where: { id: issueId, unit: { facilityId: session.facilityId } },
      select: { id: true },
    });
    if (!issue) {
      return { ok: false, message: "Issue not found for this facility." };
    }

    const viewerDepartmentIds = await departmentFilterIdsForSession(session);
    const guidance = await getOrGenerateRecoveryAssistant({
      facilityId: session.facilityId,
      issueId: issue.id,
      viewerDepartmentIds,
      departmentKey: parseDepartmentKey(input.departmentKey),
      allowProvider: true,
      forceRefresh: Boolean(input.forceRefresh),
    });

    return { ok: true, guidance };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate Recovery Assistant guidance.";
    return { ok: false, message };
  }
}

export async function ensureRecoveryAssistantAction(input: {
  issueId: string;
  departmentKey?: string | null;
}): Promise<RecoveryAssistantActionResult> {
  return refreshRecoveryAssistantAction({ ...input, forceRefresh: false });
}
