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
  loadPublishedCatalogByStableKey,
  setLogAttachmentStatus,
  updateLogAttachment,
} from "@/lib/canonical-logs";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export type ActionResult =
  | { ok: true; redirectTo: string; attachmentId: string }
  | { ok: false; error: string };

function targetReturnPath(
  targetKind: LogAttachmentTargetKind,
  targetId: string,
): string {
  switch (targetKind) {
    case "ASSET":
      return `/build/logs/targets/asset/${targetId}`;
    case "SPACE":
      return `/build/logs/targets/space/${targetId}`;
    case "UNIT":
      return `/build/logs/targets/unit/${targetId}`;
    case "DEPARTMENT":
      return `/admin/departments/${targetId}?tab=overview`;
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

    const redirectTo = targetReturnPath(input.targetKind, input.targetId);
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
