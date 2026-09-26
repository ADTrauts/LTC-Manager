"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ensureFacilityCatalogInstall,
  loadPublishedCatalogByStableKey,
  setLogAttachmentStatus,
} from "@/lib/canonical-logs";
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

export async function addFacilityTypeLogDefaultAction(
  formData: FormData,
): Promise<LocationRoomActionResult> {
  try {
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const facilityRoomTypeId = z.string().cuid().parse(formData.get("facilityRoomTypeId"));
    const catalogStableKey = z.string().min(1).parse(String(formData.get("catalogStableKey") ?? "").trim());
    const session = await requireManager(departmentId);
    const [roomType, catalog] = await Promise.all([
      prisma.facilityRoomType.findFirst({
        where: { id: facilityRoomTypeId, facilityId: session.facilityId },
        select: { id: true, displayName: true },
      }),
      loadPublishedCatalogByStableKey(prisma, catalogStableKey),
    ]);
    if (!roomType) throw new Error("Facility room type not found.");
    if (!catalog) throw new Error("Catalog log not found.");
    await ensureFacilityCatalogInstall(prisma, {
      facilityId: session.facilityId,
      catalogDefinitionId: catalog.id,
      catalogStableKey: catalog.stableKey,
      catalogVersion: catalog.version,
    });
    await prisma.departmentFacilityTypeLogDefault.create({
      data: {
        facilityId: session.facilityId,
        departmentId,
        facilityRoomTypeId: roomType.id,
        catalogDefinitionId: catalog.id,
        catalogStableKey: catalog.stableKey,
        catalogVersion: catalog.version,
      },
    });
    revalidateLocations(departmentId);
    return { ok: true, message: `Added to all ${roomType.displayName} rooms.` };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "That log is already a default for this Facility type." };
    }
    return fail(error);
  }
}

export async function removeFacilityTypeLogDefaultAction(
  formData: FormData,
): Promise<LocationRoomActionResult> {
  try {
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const defaultId = z.string().cuid().parse(formData.get("defaultId"));
    const session = await requireManager(departmentId);
    const existing = await prisma.departmentFacilityTypeLogDefault.findFirst({
      where: { id: defaultId, facilityId: session.facilityId, departmentId },
      select: { id: true },
    });
    if (!existing) throw new Error("Type default not found.");
    await prisma.departmentFacilityTypeLogDefault.delete({ where: { id: existing.id } });
    revalidateLocations(departmentId);
    return { ok: true, message: "Removed this log from the Facility type." };
  } catch (error) {
    return fail(error);
  }
}

export async function suppressFacilityTypeLogDefaultAction(
  formData: FormData,
): Promise<LocationRoomActionResult> {
  try {
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const spaceId = z.string().cuid().parse(formData.get("spaceId"));
    const defaultId = z.string().cuid().parse(formData.get("defaultId"));
    const session = await requireManager(departmentId);
    const existing = await prisma.departmentFacilityTypeLogDefault.findFirst({
      where: { id: defaultId, facilityId: session.facilityId, departmentId },
      select: { id: true },
    });
    if (!existing) throw new Error("Type default not found.");
    await prisma.departmentLocationLogSuppression.upsert({
      where: { spaceId_defaultId: { spaceId, defaultId } },
      create: { departmentId, spaceId, defaultId },
      update: {},
    });
    revalidateLocations(departmentId);
    return { ok: true, message: "This room no longer inherits that log." };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreFacilityTypeLogDefaultAction(
  formData: FormData,
): Promise<LocationRoomActionResult> {
  try {
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const spaceId = z.string().cuid().parse(formData.get("spaceId"));
    const defaultId = z.string().cuid().parse(formData.get("defaultId"));
    const session = await requireManager(departmentId);
    await prisma.departmentLocationLogSuppression.deleteMany({
      where: { departmentId, spaceId, defaultId },
    });
    revalidateLocations(departmentId);
    return { ok: true, message: "This room inherits the Facility type log again." };
  } catch (error) {
    return fail(error);
  }
}
