"use server";

import { hasAtLeastRole } from "@/lib/access";
import { getOrGenerateShiftTransition } from "@/lib/ai/shift-transition";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { requireFacilitySession } from "@/lib/facility-context";
import { isAiShiftSummaryEnabled } from "@/lib/feature-flags";
import type { ShiftTransitionView } from "@/lib/ai/shift-transition/types";

export type ShiftTransitionActionResult =
  | { ok: true; summary: ShiftTransitionView }
  | { ok: false; message: string };

function parseDepartmentKey(value: unknown): OperationalDepartmentKey | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  if (key === "DIETARY" || key === "EVS" || key === "PLANT") {
    return key;
  }
  return null;
}

/** Manager+ may trigger provider generation / refresh for shift transition. */
export async function refreshShiftTransitionAction(input: {
  departmentKey?: string | null;
  forceRefresh?: boolean;
}): Promise<ShiftTransitionActionResult> {
  try {
    const session = await requireFacilitySession();
    if (!hasAtLeastRole(session.role, "MANAGER")) {
      return { ok: false, message: "Only managers can refresh the Shift Transition Summary." };
    }
    if (!isAiShiftSummaryEnabled()) {
      return { ok: false, message: "Shift Transition Summary AI is disabled." };
    }

    const summary = await getOrGenerateShiftTransition({
      facilityId: session.facilityId,
      departmentKey: parseDepartmentKey(input.departmentKey),
      allowProvider: true,
      forceRefresh: Boolean(input.forceRefresh),
    });

    return { ok: true, summary };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate Shift Transition Summary.";
    return { ok: false, message };
  }
}

export async function ensureShiftTransitionAction(input: {
  departmentKey?: string | null;
}): Promise<ShiftTransitionActionResult> {
  return refreshShiftTransitionAction({ ...input, forceRefresh: false });
}
