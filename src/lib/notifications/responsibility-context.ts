/**
 * Scope for responsibility reconciliation.
 *
 * The thread keeps the department it was opened for. Coverage and Key Point
 * locations stay on the thread grain. An Asset or Work Order uses its current
 * unit and space, because that is where the condition is. A later department
 * edit on the Asset or Work Order does not move the thread.
 */

import { NotificationRecipientReason, type Prisma, type PrismaClient } from "@prisma/client";

export type ResponsibilityDb = PrismaClient | Prisma.TransactionClient;

export type ResponsibilityContext = {
  facilityId: string;
  departmentId: string;
  unitId: string | null;
  spaceId: string | null;
  serviceDate: string | null;
  primaryReason: NotificationRecipientReason;
};

export type ResponsibilityContextResult =
  | { ok: true; context: ResponsibilityContext }
  | { ok: false; cause: "responsibility_context_missing" };

const REASONS = new Set<string>(Object.values(NotificationRecipientReason));

type ThreadNotification = {
  facilityId: string;
  departmentId: string | null;
  sourceType: string;
  sourceId: string;
  metadata: Prisma.JsonValue | null;
};

function record(value: Prisma.JsonValue | null): Prisma.JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

export function readPrimaryResponsibilityReason(
  metadata: Prisma.JsonValue | null,
): NotificationRecipientReason | null {
  const root = record(metadata);
  const responsibility = root ? record(root.responsibility ?? null) : null;
  const reason = responsibility?.primaryReason;
  if (typeof reason !== "string" || !REASONS.has(reason)) return null;
  return reason as NotificationRecipientReason;
}

function threadParts(sourceId: string): string[] | null {
  try {
    const value: unknown = JSON.parse(sourceId);
    if (!Array.isArray(value) || value.some((part) => typeof part !== "string" || part.length === 0)) return null;
    return value as string[];
  } catch {
    return null;
  }
}

function fixedPlace(
  notification: ThreadNotification,
  kind: string,
  serviceDateIndex: number,
  departmentIndex: number,
  spaceIndex: number,
): ResponsibilityContext | null {
  const primaryReason = readPrimaryResponsibilityReason(notification.metadata);
  if (!primaryReason || !notification.departmentId) return null;
  const parts = threadParts(notification.sourceId);
  if (!parts || parts[0] !== kind || parts[1] !== notification.facilityId) return null;
  const serviceDate = parts[serviceDateIndex];
  const departmentId = parts[departmentIndex];
  const spaceId = parts[spaceIndex];
  if (!serviceDate || departmentId !== notification.departmentId || !spaceId) return null;
  return {
    facilityId: notification.facilityId,
    departmentId,
    unitId: null,
    spaceId,
    serviceDate,
    primaryReason,
  };
}

export async function loadResponsibilityContext(
  db: ResponsibilityDb,
  notification: ThreadNotification,
): Promise<ResponsibilityContextResult> {
  const primaryReason = readPrimaryResponsibilityReason(notification.metadata);
  if (!primaryReason || !notification.departmentId) return { ok: false, cause: "responsibility_context_missing" };

  if (notification.sourceType === "coverage_responsibility") {
    const context = fixedPlace(notification, "coverage", 2, 3, 4);
    return context ? { ok: true, context } : { ok: false, cause: "responsibility_context_missing" };
  }
  if (notification.sourceType === "key_point_occurrence") {
    const context = fixedPlace(notification, "key_point", 2, 3, 4);
    return context ? { ok: true, context } : { ok: false, cause: "responsibility_context_missing" };
  }
  if (notification.sourceType === "asset_status") {
    const parts = threadParts(notification.sourceId);
    const assetId = parts?.[0] === "asset_out_of_service" ? parts[2] : null;
    if (!assetId || parts?.[1] !== notification.facilityId) return { ok: false, cause: "responsibility_context_missing" };
    const asset = await db.asset.findFirst({
      where: { id: assetId, unit: { facilityId: notification.facilityId } },
      select: { unitId: true, spaceId: true },
    });
    if (!asset) return { ok: false, cause: "responsibility_context_missing" };
    return {
      ok: true,
      context: {
        facilityId: notification.facilityId,
        departmentId: notification.departmentId,
        unitId: asset.unitId,
        spaceId: asset.spaceId,
        serviceDate: null,
        primaryReason,
      },
    };
  }
  if (notification.sourceType === "work_order_response") {
    const parts = threadParts(notification.sourceId);
    const repairId = parts?.[0] === "work_order_intervention" ? parts[2] : null;
    if (!repairId || parts?.[1] !== notification.facilityId) return { ok: false, cause: "responsibility_context_missing" };
    const repair = await db.repair.findFirst({
      where: { id: repairId, unit: { facilityId: notification.facilityId } },
      select: { unitId: true, spaceId: true },
    });
    if (!repair) return { ok: false, cause: "responsibility_context_missing" };
    return {
      ok: true,
      context: {
        facilityId: notification.facilityId,
        departmentId: notification.departmentId,
        unitId: repair.unitId,
        spaceId: repair.spaceId,
        serviceDate: null,
        primaryReason,
      },
    };
  }
  return { ok: false, cause: "responsibility_context_missing" };
}
