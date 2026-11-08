"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { setLogAttachmentStatus } from "@/lib/canonical-logs";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { resolveTeamAuthority } from "@/lib/department-teams";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

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

async function requireManager(departmentId: string) {
  const session = await requireFacilitySession();
  const authority = await resolveTeamAuthority(session, session.facilityId, departmentId);
  if (!authority.canManage) {
    throw new Error("You do not have permission to change location programming.");
  }
  if (!isCanonicalLogsEnabled()) {
    throw new Error("Canonical Logs are not enabled.");
  }
  return session;
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
      attachmentId: row.id,
      status: "RETIRED",
    });
    revalidateLocations(departmentId);
    return { ok: true, message: "Log removed from this room." };
  } catch (error) {
    return fail(error);
  }
}

const FACILITY_TYPE_LOG_RETIRED =
  "Choose the rooms this record applies to. Facility Room Type does not add the record to current or future rooms.";

export async function addFacilityTypeLogDefaultAction(
  _formData: FormData,
): Promise<LocationRoomActionResult> {
  return { ok: false, message: FACILITY_TYPE_LOG_RETIRED };
}

export async function removeFacilityTypeLogDefaultAction(
  _formData: FormData,
): Promise<LocationRoomActionResult> {
  return { ok: false, message: FACILITY_TYPE_LOG_RETIRED };
}

export async function suppressFacilityTypeLogDefaultAction(
  _formData: FormData,
): Promise<LocationRoomActionResult> {
  return { ok: false, message: FACILITY_TYPE_LOG_RETIRED };
}

export async function restoreFacilityTypeLogDefaultAction(
  _formData: FormData,
): Promise<LocationRoomActionResult> {
  return { ok: false, message: FACILITY_TYPE_LOG_RETIRED };
}
