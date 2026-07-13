"use server";

import { hasAtLeastRole } from "@/lib/access";
import { getOrGenerateMorningBrief } from "@/lib/ai";
import { isAiBriefEnabled } from "@/lib/feature-flags";
import { requireFacilitySession } from "@/lib/facility-context";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { MorningBriefView } from "@/lib/ai/types";

export type MorningBriefActionResult =
  | { ok: true; brief: MorningBriefView }
  | { ok: false; message: string };

function parseDepartmentKey(value: unknown): OperationalDepartmentKey | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  if (key === "DIETARY" || key === "EVS" || key === "PLANT") {
    return key;
  }
  return null;
}

/** Manager+ may trigger provider generation / refresh. */
export async function refreshMorningBriefAction(input: {
  departmentKey?: string | null;
  forceRefresh?: boolean;
}): Promise<MorningBriefActionResult> {
  try {
    const session = await requireFacilitySession();
    if (!hasAtLeastRole(session.role, "MANAGER")) {
      return { ok: false, message: "Only managers can refresh the Morning Brief." };
    }
    if (!isAiBriefEnabled()) {
      return { ok: false, message: "Morning Brief AI is disabled." };
    }

    const brief = await getOrGenerateMorningBrief({
      facilityId: session.facilityId,
      departmentKey: parseDepartmentKey(input.departmentKey),
      allowProvider: true,
      forceRefresh: Boolean(input.forceRefresh),
    });

    return { ok: true, brief };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate Morning Brief.";
    return { ok: false, message };
  }
}

/** Non-blocking ensure: may call provider once when no READY cache exists. Manager+ only. */
export async function ensureMorningBriefAction(input: {
  departmentKey?: string | null;
}): Promise<MorningBriefActionResult> {
  return refreshMorningBriefAction({ ...input, forceRefresh: false });
}
