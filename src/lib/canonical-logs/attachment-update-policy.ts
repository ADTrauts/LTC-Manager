/**
 * Prospective Attachment update policy (pure).
 *
 * Historical-significant edits on an already-effective Attachment must close the
 * current segment and open a successor starting the next service date.
 * Display-only edits and not-yet-effective rows may update in place.
 */

import { dayBefore, nextOperationalDayKey } from "@/lib/operational-cycles/cycle-lifecycle";
import { toServiceDateKey } from "@/lib/operational-time";

export type AttachmentUpdateMode = "IN_PLACE" | "SUCCESSOR" | "CLOSE_ONLY";

export type AttachmentTimingSnapshot = {
  timingMode: string;
  dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleStableKeys: string[];
  calendarCadence: string | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal: string | null;
  allowAdHoc: boolean;
};

export type AttachmentHistoricalSnapshot = AttachmentTimingSnapshot & {
  catalogDefinitionId: string;
  catalogVersion: number;
  departmentId: string;
  targetKind: string;
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
  operationalTypeKey: string | null;
};

const DISPLAY_ONLY_KEYS = ["localDisplayLabel", "localInstructions"] as const;

export function attachmentLineageKey(input: {
  catalogStableKey: string;
  targetKind: string;
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
  operationalTypeKey?: string | null;
  departmentId?: string | null;
}): string {
  const targetId =
    input.targetKind === "ASSET"
      ? input.assetId ?? "-"
      : input.targetKind === "SPACE"
        ? input.spaceId ?? "-"
        : input.targetKind === "UNIT"
          ? input.unitId ?? "-"
          : input.targetKind === "DEPARTMENT"
            ? input.targetDepartmentId ?? "-"
            : input.targetKind === "OPERATIONAL_TYPE"
              ? `${input.departmentId ?? "-"}:${input.operationalTypeKey ?? "-"}`
              : "facility";
  return `${input.catalogStableKey}|${input.targetKind}|${targetId}`;
}

export function attachmentHasBecomeEffective(input: {
  effectiveFromKey: string;
  todayKey: string;
}): boolean {
  return input.effectiveFromKey <= input.todayKey;
}

export function lastServiceDateOldConfigApplies(todayKey: string): string {
  return todayKey;
}

export function successorEffectiveFromKey(todayKey: string): string {
  return nextOperationalDayKey(todayKey);
}

export function retireCloseDateKey(input: {
  effectiveFromKey: string;
  todayKey: string;
}): string {
  if (!attachmentHasBecomeEffective(input)) {
    return dayBefore(input.effectiveFromKey);
  }
  return input.todayKey;
}

function sortedKeys(keys: readonly string[]): string {
  return [...keys].map((k) => k.trim()).filter(Boolean).sort().join(",");
}

function windowsEqual(
  a: AttachmentTimingSnapshot["dailyWindows"],
  b: AttachmentTimingSnapshot["dailyWindows"],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (w, i) =>
      w.label === b[i]!.label &&
      w.startLocal === b[i]!.startLocal &&
      w.endLocal === b[i]!.endLocal,
  );
}

function daysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const aa = [...a].sort((x, y) => x - y);
  const bb = [...b].sort((x, y) => x - y);
  return aa.every((n, i) => n === bb[i]);
}

export function timingSnapshotsEqual(
  a: AttachmentTimingSnapshot,
  b: AttachmentTimingSnapshot,
): boolean {
  return (
    a.timingMode === b.timingMode &&
    a.allowAdHoc === b.allowAdHoc &&
    a.calendarCadence === b.calendarCadence &&
    a.calendarDayOfMonth === b.calendarDayOfMonth &&
    a.calendarDueTimeLocal === b.calendarDueTimeLocal &&
    daysEqual(a.calendarDaysOfWeek, b.calendarDaysOfWeek) &&
    sortedKeys(a.cycleStableKeys) === sortedKeys(b.cycleStableKeys) &&
    windowsEqual(a.dailyWindows, b.dailyWindows)
  );
}

export function historicalSnapshotsEqual(
  a: AttachmentHistoricalSnapshot,
  b: AttachmentHistoricalSnapshot,
): boolean {
  return (
    timingSnapshotsEqual(a, b) &&
    a.catalogDefinitionId === b.catalogDefinitionId &&
    a.catalogVersion === b.catalogVersion &&
    a.departmentId === b.departmentId &&
    a.targetKind === b.targetKind &&
    a.assetId === b.assetId &&
    a.spaceId === b.spaceId &&
    a.unitId === b.unitId &&
    a.targetDepartmentId === b.targetDepartmentId &&
    a.operationalTypeKey === b.operationalTypeKey
  );
}

export function isDisplayOnlyAttachmentPatch(input: {
  existing: AttachmentHistoricalSnapshot;
  next: AttachmentHistoricalSnapshot;
  localDisplayLabelChanged: boolean;
  localInstructionsChanged: boolean;
}): boolean {
  if (!historicalSnapshotsEqual(input.existing, input.next)) return false;
  return input.localDisplayLabelChanged || input.localInstructionsChanged;
}

export function classifyAttachmentUpdate(input: {
  effectiveFromKey: string;
  todayKey: string;
  existing: AttachmentHistoricalSnapshot;
  next: AttachmentHistoricalSnapshot;
  localDisplayLabelChanged: boolean;
  localInstructionsChanged: boolean;
  nextStatus?: "ACTIVE" | "INACTIVE" | "RETIRED";
  existingStatus: "ACTIVE" | "INACTIVE" | "RETIRED";
  existingEffectiveToKey?: string | null;
}): {
  mode: AttachmentUpdateMode;
  closeEffectiveToKey: string | null;
  successorFromKey: string | null;
  reason: string;
} {
  const becomeEffective = attachmentHasBecomeEffective({
    effectiveFromKey: input.effectiveFromKey,
    todayKey: input.todayKey,
  });
  const nextStatus = input.nextStatus ?? input.existingStatus;

  if (nextStatus === "RETIRED" || nextStatus === "INACTIVE") {
    return {
      mode: "CLOSE_ONLY",
      closeEffectiveToKey: retireCloseDateKey({
        effectiveFromKey: input.effectiveFromKey,
        todayKey: input.todayKey,
      }),
      successorFromKey: null,
      reason:
        nextStatus === "RETIRED"
          ? "Retirement closes the current segment without rewriting history."
          : "Inactivation closes the current segment without rewriting history.",
    };
  }

  if (input.existingStatus !== "ACTIVE" && nextStatus === "ACTIVE") {
    const alreadyClosed = Boolean(input.existingEffectiveToKey);
    if (becomeEffective || alreadyClosed) {
      return {
        mode: "SUCCESSOR",
        closeEffectiveToKey: alreadyClosed
          ? input.existingEffectiveToKey ?? null
          : retireCloseDateKey({
              effectiveFromKey: input.effectiveFromKey,
              todayKey: input.todayKey,
            }),
        successorFromKey: successorEffectiveFromKey(input.todayKey),
        reason: "Reactivation opens a successor segment; the closed row is not reopened.",
      };
    }
  }

  const displayOnly = isDisplayOnlyAttachmentPatch({
    existing: input.existing,
    next: input.next,
    localDisplayLabelChanged: input.localDisplayLabelChanged,
    localInstructionsChanged: input.localInstructionsChanged,
  });

  if (displayOnly || historicalSnapshotsEqual(input.existing, input.next)) {
    return {
      mode: "IN_PLACE",
      closeEffectiveToKey: null,
      successorFromKey: null,
      reason: displayOnly
        ? "Label/instructions do not change historical expected slots."
        : "No historical-significant fields changed.",
    };
  }

  if (!becomeEffective) {
    return {
      mode: "IN_PLACE",
      closeEffectiveToKey: null,
      successorFromKey: null,
      reason: "Attachment is not yet effective, so in-place edit cannot rewrite history.",
    };
  }

  return {
    mode: "SUCCESSOR",
    closeEffectiveToKey: lastServiceDateOldConfigApplies(input.todayKey),
    successorFromKey: successorEffectiveFromKey(input.todayKey),
    reason: "Historical-significant change on an effective Attachment starts next service day.",
  };
}

export function effectiveFromKeyFromDate(value: Date): string {
  return toServiceDateKey(value);
}

/** Inclusive service-date ranges. Null `to` means open-ended. */
export function attachmentRangesOverlap(
  a: { fromKey: string; toKey: string | null },
  b: { fromKey: string; toKey: string | null },
): boolean {
  const aEnd = a.toKey ?? "9999-12-31";
  const bEnd = b.toKey ?? "9999-12-31";
  return a.fromKey <= bEnd && b.fromKey <= aEnd;
}

export const DISPLAY_ONLY_ATTACHMENT_FIELDS: readonly string[] = DISPLAY_ONLY_KEYS;
