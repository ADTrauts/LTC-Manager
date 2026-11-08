"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import {
  archiveDepartmentTeam,
  createDepartmentTeam,
  updateDepartmentTeam,
} from "@/lib/department-teams";

export type TeamActionResult =
  | { ok: true; message?: string; teamId?: string }
  | { ok: false; message: string; errors?: string[] };

function revalidateTeams(departmentId: string) {
  revalidatePath(`/admin/departments/${departmentId}`);
  revalidatePath(`/admin/departments/${departmentId}`, "page");
  revalidatePath(`/build/departments/${departmentId}`);
  revalidatePath("/admin/departments");
  revalidatePath("/employees");
}

function optionalId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fail(error: unknown): TeamActionResult {
  const message = error instanceof Error ? error.message : "Could not save Team.";
  return { ok: false, message };
}

const createSchema = z.object({
  departmentId: z.string().min(1),
  displayName: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  // Seed and imported employees may use stable string ids, not only CUIDs.
  managerEmployeeId: z.string().min(1).nullable(),
});

export async function createDepartmentTeamAction(formData: FormData): Promise<TeamActionResult> {
  try {
    const session = await requireFacilitySession();
    const parsed = createSchema.parse({
      departmentId: formData.get("departmentId"),
      displayName: String(formData.get("displayName") ?? ""),
      description: optionalId(formData.get("description")) ?? undefined,
      managerEmployeeId: optionalId(formData.get("managerEmployeeId")),
    });
    const team = await createDepartmentTeam(session, {
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      displayName: parsed.displayName,
      description: parsed.description ?? null,
      managerEmployeeId: parsed.managerEmployeeId,
    });
    revalidateTeams(parsed.departmentId);
    return { ok: true, message: "Team created.", teamId: team.id };
  } catch (error) {
    return fail(error);
  }
}

const updateSchema = z.object({
  teamId: z.string().min(1),
  displayName: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  managerEmployeeId: z.string().min(1).nullable(),
});

export async function updateDepartmentTeamAction(formData: FormData): Promise<TeamActionResult> {
  try {
    const session = await requireFacilitySession();
    const parsed = updateSchema.parse({
      teamId: formData.get("teamId"),
      displayName: String(formData.get("displayName") ?? ""),
      description: optionalId(formData.get("description")) ?? undefined,
      managerEmployeeId: optionalId(formData.get("managerEmployeeId")),
    });
    const team = await updateDepartmentTeam(session, {
      facilityId: session.facilityId,
      teamId: parsed.teamId,
      displayName: parsed.displayName,
      description: parsed.description ?? null,
      managerEmployeeId: parsed.managerEmployeeId,
    });
    revalidateTeams(team.departmentId);
    return { ok: true, message: "Team saved.", teamId: team.id };
  } catch (error) {
    return fail(error);
  }
}

export async function archiveDepartmentTeamAction(formData: FormData): Promise<TeamActionResult> {
  try {
    const session = await requireFacilitySession();
    const teamId = z.string().min(1).parse(formData.get("teamId"));
    const departmentId = z.string().min(1).parse(formData.get("departmentId"));
    await archiveDepartmentTeam(session, {
      facilityId: session.facilityId,
      teamId,
    });
    revalidateTeams(departmentId);
    return { ok: true, message: "Team archived." };
  } catch (error) {
    return fail(error);
  }
}
