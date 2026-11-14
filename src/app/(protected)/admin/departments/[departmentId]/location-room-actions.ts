"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { setLogAttachmentStatus } from "@/lib/canonical-logs";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { resolveTeamAuthority } from "@/lib/department-teams";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { updateDepartmentSpaceNote } from "@/lib/department-administration/department-space-notes";

export type LocationRoomActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string; errors?: string[] };

function revalidateLocations(departmentId: string) {
  revalidatePath(`/admin/departments/${departmentId}`);
  revalidatePath(`/admin/departments/${departmentId}`, "page");
}

function fail(error: unknown): LocationRoomActionResult {
  const message = error instanceof Error ? error.message : "Could not update location logs.";
  return { ok: false, message };
}

async function requireDepartmentLocationManager(departmentId: string) {
  const session = await requireFacilitySession();
  const authority = await resolveTeamAuthority(session, session.facilityId, departmentId);
  if (!authority.canManage) {
    throw new Error("You do not have permission to change location programming.");
  }
  return session;
}

async function requireManager(departmentId: string) {
  const session = await requireDepartmentLocationManager(departmentId);
  if (!isCanonicalLogsEnabled()) {
    throw new Error("Canonical Logs are not enabled.");
  }
  return session;
}

/** Optional Department × Space descriptive note. Not operational configuration. */
export async function updateDepartmentSpaceNoteAction(
  formData: FormData,
): Promise<LocationRoomActionResult> {
  try {
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const spaceId = z.string().cuid().parse(formData.get("spaceId"));
    const notesRaw = String(formData.get("notes") ?? "");
    const session = await requireDepartmentLocationManager(departmentId);
    await updateDepartmentSpaceNote(prisma, {
      facilityId: session.facilityId,
      departmentId,
      spaceId,
      notes: notesRaw,
    });
    revalidateLocations(departmentId);
    return { ok: true, message: "Department room note saved." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update Department room note.";
    return { ok: false, message };
  }
}

export async function removeRoomLogAction(formData: FormData): Promise<LocationRoomActionResult> {
  try {
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const attachmentId = z.string().cuid().parse(formData.get("attachmentId"));
    const session = await requireManager(departmentId);
    const row = await prisma.logAttachment.findFirst({
      where: {
        id: attachmentId,
        facilityId: session.facilityId,
        departmentId,
        targetKind: "SPACE",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!row) throw new Error("Log not found on this room.");
    await setLogAttachmentStatus(prisma, {
      facilityId: session.facilityId,
      session,
      attachmentId: row.id,
      status: "RETIRED",
    });
    revalidateLocations(departmentId);
    return { ok: true, message: "Log removed from this room." };
  } catch (error) {
    return fail(error);
  }
}
