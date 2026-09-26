"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createCycleDraftAction } from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";
import {
  assertUniqueRootCycleLabel,
  linkTeamToCycle,
  unlinkTeamFromCycle,
  updateTeamCycleNeed,
} from "@/lib/department-teams";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

export type TeamCycleActionResult =
  | { ok: true; message?: string; teamId?: string; cycleId?: string }
  | { ok: false; message: string; errors?: string[] };

function revalidateTeamCycles(departmentId: string) {
  revalidatePath(`/admin/departments/${departmentId}`);
  revalidatePath(`/admin/departments/${departmentId}`, "page");
  revalidatePath("/staffing/cycles");
}

function fail(error: unknown): TeamCycleActionResult {
  const message = error instanceof Error ? error.message : "Could not save team cycle.";
  return { ok: false, message };
}

export async function createTeamCycleAction(formData: FormData): Promise<TeamCycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const teamId = z.string().cuid().parse(formData.get("teamId"));
    const label = String(formData.get("label") ?? "").trim();
    const parentStableKey = String(formData.get("parentStableKey") ?? "").trim();
    if (!parentStableKey) {
      await assertUniqueRootCycleLabel(prisma, { departmentId, label });
    }
    const created = await createCycleDraftAction(formData);
    if (!created.ok) return created;
    if (!parentStableKey && created.cycleId) {
      const row = await prisma.departmentOperationalCycle.findFirst({
        where: {
          id: created.cycleId,
          facilityId: session.facilityId,
          departmentId,
        },
        select: { stableKey: true },
      });
      if (row) {
        await linkTeamToCycle(prisma, {
          facilityId: session.facilityId,
          departmentId,
          teamId,
          cycleStableKey: row.stableKey,
        });
      }
    }
    revalidateTeamCycles(departmentId);
    return {
      ok: true,
      message: parentStableKey ? created.message : `Draft “${label}” created and linked.`,
      teamId,
      cycleId: created.cycleId,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function linkTeamCycleAction(formData: FormData): Promise<TeamCycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const teamId = z.string().cuid().parse(formData.get("teamId"));
    const cycleStableKey = z.string().min(1).parse(String(formData.get("cycleStableKey") ?? "").trim());
    await linkTeamToCycle(prisma, {
      facilityId: session.facilityId,
      departmentId,
      teamId,
      cycleStableKey,
    });
    revalidateTeamCycles(departmentId);
    return { ok: true, message: "Cycle linked to this team.", teamId };
  } catch (error) {
    return fail(error);
  }
}

export async function unlinkTeamCycleAction(formData: FormData): Promise<TeamCycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const teamId = z.string().cuid().parse(formData.get("teamId"));
    const linkId = z.string().cuid().parse(formData.get("linkId"));
    await unlinkTeamFromCycle(prisma, {
      facilityId: session.facilityId,
      teamId,
      linkId,
    });
    revalidateTeamCycles(departmentId);
    return { ok: true, message: "Cycle unlinked from this team.", teamId };
  } catch (error) {
    return fail(error);
  }
}

export async function updateTeamCycleNeedAction(formData: FormData): Promise<TeamCycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const teamId = z.string().cuid().parse(formData.get("teamId"));
    const linkId = z.string().cuid().parse(formData.get("linkId"));
    const rawCount = String(formData.get("requiredCount") ?? "").trim();
    const requiredCount = rawCount === "" ? null : z.coerce.number().int().min(1).parse(rawCount);
    const grain = z.enum(["TOTAL", "PER_ROOM"]).parse(String(formData.get("grain") ?? "TOTAL"));
    await updateTeamCycleNeed(prisma, {
      facilityId: session.facilityId,
      teamId,
      linkId,
      requiredCount,
      grain,
    });
    revalidateTeamCycles(departmentId);
    return { ok: true, message: "Staffing need saved.", teamId };
  } catch (error) {
    return fail(error);
  }
}
