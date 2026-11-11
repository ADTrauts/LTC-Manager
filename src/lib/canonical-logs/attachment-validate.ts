import type {
  LogAttachmentTargetKind,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import type { LogAttachmentTarget } from "@/lib/logs-architecture/types";
import { attachmentTimingFingerprint } from "@/lib/logs-architecture/attachment-rules";
import type { LogAttachmentTimingConfig } from "@/lib/logs-architecture/types";

export type AttachmentTargetInput = {
  kind: LogAttachmentTargetKind;
  assetId?: string | null;
  spaceId?: string | null;
  unitId?: string | null;
  targetDepartmentId?: string | null;
};

type Db = PrismaClient | Prisma.TransactionClient;

export function normalizeAttachmentTarget(input: AttachmentTargetInput): {
  targetKind: LogAttachmentTargetKind;
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
  target: LogAttachmentTarget;
} {
  const assetId = input.assetId?.trim() || null;
  const spaceId = input.spaceId?.trim() || null;
  const unitId = input.unitId?.trim() || null;
  const targetDepartmentId = input.targetDepartmentId?.trim() || null;

  const setCount = [assetId, spaceId, unitId, targetDepartmentId].filter(Boolean).length;

  switch (input.kind) {
    case "ASSET":
      if (!assetId || setCount !== 1) {
        throw new Error("ASSET target requires exactly assetId.");
      }
      return {
        targetKind: "ASSET",
        assetId,
        spaceId: null,
        unitId: null,
        targetDepartmentId: null,
        target: { kind: "ASSET", assetId },
      };
    case "SPACE":
      if (!spaceId || setCount !== 1) {
        throw new Error("SPACE target requires exactly spaceId.");
      }
      return {
        targetKind: "SPACE",
        assetId: null,
        spaceId,
        unitId: null,
        targetDepartmentId: null,
        target: { kind: "SPACE", spaceId },
      };
    case "UNIT":
      if (!unitId || setCount !== 1) {
        throw new Error("UNIT target requires exactly unitId.");
      }
      return {
        targetKind: "UNIT",
        assetId: null,
        spaceId: null,
        unitId,
        targetDepartmentId: null,
        target: { kind: "UNIT", unitId },
      };
    case "DEPARTMENT":
      if (!targetDepartmentId || setCount !== 1) {
        throw new Error("DEPARTMENT target requires exactly targetDepartmentId.");
      }
      return {
        targetKind: "DEPARTMENT",
        assetId: null,
        spaceId: null,
        unitId: null,
        targetDepartmentId,
        target: { kind: "DEPARTMENT", departmentId: targetDepartmentId },
      };
    case "FACILITY":
      if (setCount !== 0) {
        throw new Error("FACILITY target must not set asset/space/unit/department target ids.");
      }
      return {
        targetKind: "FACILITY",
        assetId: null,
        spaceId: null,
        unitId: null,
        targetDepartmentId: null,
        target: { kind: "FACILITY" },
      };
  }
}

export async function validateAttachmentTarget(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
  target: AttachmentTargetInput;
}): Promise<ReturnType<typeof normalizeAttachmentTarget>> {
  const normalized = normalizeAttachmentTarget(input.target);
  const { client, facilityId } = input;

  if (normalized.targetKind === "ASSET" && normalized.assetId) {
    const asset = await client.asset.findFirst({
      where: { id: normalized.assetId, unit: { facilityId } },
      select: { id: true },
    });
    if (!asset) throw new Error("Asset not found in this facility.");
  }

  if (normalized.targetKind === "SPACE" && normalized.spaceId) {
    const space = await client.unitSpace.findFirst({
      where: { id: normalized.spaceId, facilityId },
      select: { id: true },
    });
    if (!space) throw new Error("Space not found in this facility.");
  }

  if (normalized.targetKind === "UNIT" && normalized.unitId) {
    const unit = await client.unit.findFirst({
      where: { id: normalized.unitId, facilityId },
      select: { id: true },
    });
    if (!unit) throw new Error("Unit not found in this facility.");
  }

  if (normalized.targetKind === "DEPARTMENT" && normalized.targetDepartmentId) {
    const dept = await client.department.findFirst({
      where: { id: normalized.targetDepartmentId, facilityId },
      select: { id: true },
    });
    if (!dept) throw new Error("Target department not found in this facility.");
  }

  const owning = await client.department.findFirst({
    where: { id: input.departmentId, facilityId },
    select: { id: true },
  });
  if (!owning) throw new Error("Owning department not found in this facility.");

  return normalized;
}

export function timingConfigFromRows(input: {
  timingMode: "DAILY_WINDOWS" | "OPERATIONAL_CYCLE" | "CALENDAR" | "AD_HOC";
  dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleStableKeys: string[];
  calendar: {
    cadenceType: "DAILY" | "WEEKLY" | "MONTHLY";
    daysOfWeek: number[];
    dayOfMonth: number | null;
    dueTimeLocal: string | null;
  } | null;
  allowAdHoc: boolean;
}): LogAttachmentTimingConfig {
  const source =
    input.timingMode === "DAILY_WINDOWS"
      ? "DAILY_WINDOWS"
      : input.timingMode === "OPERATIONAL_CYCLE"
        ? "OPERATIONAL_CYCLE"
        : input.timingMode === "CALENDAR"
          ? "CALENDAR"
          : "AD_HOC";

  return {
    source,
    cycleStableKeys: [...input.cycleStableKeys],
    dailyWindows: input.dailyWindows.map((w) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
    })),
    calendar: input.calendar,
    allowAdHoc: input.allowAdHoc,
  };
}

export function timingFingerprintFromAttachment(input: {
  timingMode: "DAILY_WINDOWS" | "OPERATIONAL_CYCLE" | "CALENDAR" | "AD_HOC";
  dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleStableKeys: string[];
  calendarCadence: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal: string | null;
  allowAdHoc: boolean;
}): string {
  return attachmentTimingFingerprint(
    timingConfigFromRows({
      timingMode: input.timingMode,
      dailyWindows: input.dailyWindows,
      cycleStableKeys: input.cycleStableKeys,
      calendar:
        input.timingMode === "CALENDAR" && input.calendarCadence
          ? {
              cadenceType: input.calendarCadence,
              daysOfWeek: input.calendarDaysOfWeek,
              dayOfMonth: input.calendarDayOfMonth,
              dueTimeLocal: input.calendarDueTimeLocal,
            }
          : null,
      allowAdHoc: input.allowAdHoc,
    }),
  );
}
