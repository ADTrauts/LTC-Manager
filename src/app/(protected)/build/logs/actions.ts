"use server";

import { revalidatePath } from "next/cache";
import type {
  LogAttachmentCalendarCadence,
  LogAttachmentStatus,
  LogAttachmentTargetKind,
  LogAttachmentTimingMode,
} from "@prisma/client";

import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import {
  createLogAttachment,
  installPublishedCatalog,
  loadPublishedCatalogByStableKey,
  setLogAttachmentStatus,
  updateLogAttachment,
  adoptLogAttachmentCatalogVersion,
} from "@/lib/canonical-logs";
import {
  applyCatalogAssignSelection,
  CATALOG_UNASSIGN_NOTICE,
} from "@/lib/canonical-logs/catalog-assign";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export type ActionResult =
  | { ok: true; redirectTo: string; attachmentId: string }
  | { ok: false; error: string };

function safeDepartmentReturn(returnTo?: string | null): string | null {
  if (
    !returnTo?.startsWith("/admin/departments/") &&
    !returnTo?.startsWith("/build/departments/")
  ) {
    return null;
  }
  if (returnTo.includes("//") || returnTo.includes("\\")) return null;
  return returnTo;
}

function targetReturnPath(
  targetKind: LogAttachmentTargetKind,
  targetId: string,
  returnTo?: string | null,
): string {
  const departmentReturn = safeDepartmentReturn(returnTo);
  if (departmentReturn) return departmentReturn;
  switch (targetKind) {
    case "ASSET":
      return `/build/logs/targets/asset/${targetId}`;
    case "SPACE":
      return `/build/logs/targets/space/${targetId}`;
    case "UNIT":
      return `/build/logs/targets/unit/${targetId}`;
    case "DEPARTMENT":
      return `/build/departments/${targetId}?tab=overview`;
    default:
      return "/build/logs";
  }
}

function mapCreateError(message: string): string {
  if (/already exists/i.test(message) || /equivalent timing/i.test(message)) {
    return "This Log is already attached here with the same schedule.";
  }
  if (/facility/i.test(message) || /not found/i.test(message)) {
    return message;
  }
  return message;
}

export async function installCatalogAction(
  catalogStableKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isCanonicalLogsEnabled()) {
    return { ok: false, error: "Canonical Logs are not enabled." };
  }
  const session = await getSession();
  if (!session?.facilityId) return { ok: false, error: "Not signed in." };
  if (!hasAtLeastRole(session.role, "MANAGER")) {
    return { ok: false, error: "Manager access required to install logs." };
  }
  try {
    await installPublishedCatalog(prisma, {
      facilityId: session.facilityId,
      catalogStableKey,
    });
    revalidatePath("/build/logs");
    revalidatePath(`/build/logs/catalog/${catalogStableKey}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not install this log.",
    };
  }
}

export async function createCanonicalLogAttachmentAction(input: {
  catalogStableKey: string;
  departmentId: string;
  targetKind: "ASSET" | "SPACE" | "UNIT" | "DEPARTMENT";
  targetId: string;
  timingMode: LogAttachmentTimingMode;
  dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleStableKeys: string[];
  calendarCadence: LogAttachmentCalendarCadence | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal: string | null;
  allowAdHoc: boolean;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  effectiveFromKey: string;
  returnTo?: string | null;
}): Promise<ActionResult> {
  if (!isCanonicalLogsEnabled()) {
    return { ok: false, error: "Canonical Logs are not enabled." };
  }
  const session = await getSession();
  if (!session?.facilityId) return { ok: false, error: "Not signed in." };
  if (!hasAtLeastRole(session.role, "MANAGER")) {
    return { ok: false, error: "Manager access required to attach Logs." };
  }

  const catalog = await loadPublishedCatalogByStableKey(prisma, input.catalogStableKey);
  if (!catalog) {
    return { ok: false, error: "Published Catalog Log not found." };
  }

  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) {
    return { ok: false, error: "Department is not in this facility." };
  }

  const target =
    input.targetKind === "ASSET"
      ? { kind: "ASSET" as const, assetId: input.targetId }
      : input.targetKind === "SPACE"
        ? { kind: "SPACE" as const, spaceId: input.targetId }
        : input.targetKind === "UNIT"
          ? { kind: "UNIT" as const, unitId: input.targetId }
          : { kind: "DEPARTMENT" as const, targetDepartmentId: input.targetId };

  try {
    const row = await createLogAttachment(prisma, {
      facilityId: session.facilityId,
      departmentId: department.id,
      catalogDefinitionId: catalog.id,
      target,
      timingMode: input.timingMode,
      dailyWindows: input.dailyWindows,
      cycleStableKeys: input.cycleStableKeys,
      calendarCadence: input.calendarCadence,
      calendarDaysOfWeek: input.calendarDaysOfWeek,
      calendarDayOfMonth: input.calendarDayOfMonth,
      calendarDueTimeLocal: input.calendarDueTimeLocal,
      allowAdHoc: input.allowAdHoc,
      localDisplayLabel: input.localDisplayLabel,
      localInstructions: input.localInstructions,
      effectiveFromKey: input.effectiveFromKey,
    });

    const redirectTo = targetReturnPath(input.targetKind, input.targetId, input.returnTo);
    revalidatePath("/build/logs");
    revalidatePath(redirectTo);
    return { ok: true, redirectTo, attachmentId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create Attachment.";
    return { ok: false, error: mapCreateError(message) };
  }
}

export async function updateCanonicalLogAttachmentAction(input: {
  attachmentId: string;
  timingMode: LogAttachmentTimingMode;
  dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleStableKeys: string[];
  calendarCadence: LogAttachmentCalendarCadence | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal: string | null;
  allowAdHoc: boolean;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  status: LogAttachmentStatus;
  effectiveFromKey?: string;
}): Promise<ActionResult> {
  if (!isCanonicalLogsEnabled()) {
    return { ok: false, error: "Canonical Logs are not enabled." };
  }
  const session = await getSession();
  if (!session?.facilityId) return { ok: false, error: "Not signed in." };
  if (!hasAtLeastRole(session.role, "MANAGER")) {
    return { ok: false, error: "Manager access required." };
  }

  try {
    const row = await updateLogAttachment(prisma, {
      facilityId: session.facilityId,
      attachmentId: input.attachmentId,
      timingMode: input.timingMode,
      dailyWindows: input.dailyWindows,
      cycleStableKeys: input.cycleStableKeys,
      calendarCadence: input.calendarCadence,
      calendarDaysOfWeek: input.calendarDaysOfWeek,
      calendarDayOfMonth: input.calendarDayOfMonth,
      calendarDueTimeLocal: input.calendarDueTimeLocal,
      allowAdHoc: input.allowAdHoc,
      localDisplayLabel: input.localDisplayLabel,
      localInstructions: input.localInstructions,
      status: input.status,
      effectiveFromKey: input.effectiveFromKey,
    });

    const targetId =
      row.assetId ?? row.spaceId ?? row.unitId ?? row.targetDepartmentId ?? "";
    const redirectTo = targetReturnPath(row.targetKind, targetId || row.id);
    revalidatePath(redirectTo);
    revalidatePath(`/build/logs/attachments/${row.id}`);
    return { ok: true, redirectTo, attachmentId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update Attachment.";
    return { ok: false, error: message };
  }
}

export async function adoptCanonicalLogAttachmentAction(input: {
  attachmentId: string;
}): Promise<ActionResult> {
  if (!isCanonicalLogsEnabled()) {
    return { ok: false, error: "Canonical Logs are not enabled." };
  }
  const session = await getSession();
  if (!session?.facilityId) return { ok: false, error: "Not signed in." };
  if (!hasAtLeastRole(session.role, "MANAGER")) {
    return { ok: false, error: "Manager access required." };
  }

  try {
    const row = await adoptLogAttachmentCatalogVersion(prisma, {
      facilityId: session.facilityId,
      attachmentId: input.attachmentId,
    });
    const targetId =
      row.assetId ?? row.spaceId ?? row.unitId ?? row.targetDepartmentId ?? "";
    const redirectTo = targetReturnPath(row.targetKind, targetId || row.id);
    revalidatePath(redirectTo);
    revalidatePath(`/build/logs/attachments/${row.id}`);
    return { ok: true, redirectTo, attachmentId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not adopt Catalog version.";
    return { ok: false, error: message };
  }
}

export async function setCanonicalLogAttachmentStatusAction(input: {
  attachmentId: string;
  status: LogAttachmentStatus;
}): Promise<ActionResult> {
  if (!isCanonicalLogsEnabled()) {
    return { ok: false, error: "Canonical Logs are not enabled." };
  }
  const session = await getSession();
  if (!session?.facilityId) return { ok: false, error: "Not signed in." };
  if (!hasAtLeastRole(session.role, "MANAGER")) {
    return { ok: false, error: "Manager access required." };
  }

  try {
    const row = await setLogAttachmentStatus(prisma, {
      facilityId: session.facilityId,
      attachmentId: input.attachmentId,
      status: input.status,
    });
    const targetId =
      row.assetId ?? row.spaceId ?? row.unitId ?? row.targetDepartmentId ?? "";
    const redirectTo = targetReturnPath(row.targetKind, targetId || "/build/logs");
    revalidatePath(redirectTo);
    return { ok: true, redirectTo, attachmentId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update status.";
    return { ok: false, error: message };
  }
}

export type AssignCatalogResult =
  | {
      ok: true;
      added: number;
      removed: number;
      message: string;
    }
  | { ok: false; error: string };

export async function assignCanonicalLogToTargetsAction(input: {
  catalogStableKey: string;
  selectedKeys: string[];
}): Promise<AssignCatalogResult> {
  if (!isCanonicalLogsEnabled()) {
    return { ok: false, error: "Canonical Logs are not enabled." };
  }
  const session = await getSession();
  if (!session?.facilityId) return { ok: false, error: "Not signed in." };
  if (!hasAtLeastRole(session.role, "MANAGER") || session.authMethod === "QUICK_PIN") {
    return { ok: false, error: "Manager password access is required to assign Logs." };
  }

  try {
    const result = await applyCatalogAssignSelection({
      client: prisma,
      facilityId: session.facilityId,
      catalogStableKey: input.catalogStableKey,
      selectedKeys: input.selectedKeys,
    });
    revalidatePath("/build/logs", "layout");
    revalidatePath("/staffing/logs", "layout");
    revalidatePath(`/build/logs/catalog/${input.catalogStableKey}`);
    const parts: string[] = [];
    if (result.added > 0) {
      parts.push(`Assigned to ${result.added} target${result.added === 1 ? "" : "s"}.`);
    }
    if (result.removed > 0) {
      parts.push(
        `Removed from ${result.removed} target${result.removed === 1 ? "" : "s"}. ${CATALOG_UNASSIGN_NOTICE}`,
      );
    }
    if (parts.length === 0) {
      parts.push("No assignment changes.");
    }
    return {
      ok: true,
      added: result.added,
      removed: result.removed,
      message: parts.join(" "),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not assign this Log.";
    return { ok: false, error: message };
  }
}
