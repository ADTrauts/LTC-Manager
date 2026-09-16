import type { LogAttachmentTimingMode, OperationalTemplateScheduleKind } from "@prisma/client";

/** Map Attachment timing mode → Evidence scheduleKind (existing enum). */
export function mapTimingModeToScheduleKind(
  mode: LogAttachmentTimingMode,
): OperationalTemplateScheduleKind {
  switch (mode) {
    case "DAILY_WINDOWS":
      return "FIXED_DAILY_WINDOW";
    case "OPERATIONAL_CYCLE":
      return "OPERATIONAL_CYCLE";
    case "CALENDAR":
      return "ONCE_PER_OPERATIONAL_DATE";
    case "AD_HOC":
      return "AD_HOC";
  }
}
