/**
 * Applicability / suggestion disposition and Attachment uniqueness (Phase 2).
 *
 * Critical: ASSET_TYPE / SPACE_TYPE are discovery hints, not silent attach.
 */

import type { OperationalTemplateApplicabilityKind } from "@prisma/client";

import type { LogAttachmentTarget, LogAttachmentTargetKind, LogAttachmentTimingConfig } from "./types";

export type ApplicabilityDisposition =
  | "OPERATIONAL_TARGET"
  | "SUGGESTION_ONLY"
  | "COMPATIBILITY_EXPAND";

/**
 * Phase 9C Applicability kinds → future Logs disposition.
 * COMPATIBILITY_EXPAND may still expand at runtime while DIETARY_OPERATIONAL_EVIDENCE
 * templates remain facility-authored; new Catalog Attachments must not use it.
 */
export function dispositionForApplicabilityKind(
  kind: OperationalTemplateApplicabilityKind,
): ApplicabilityDisposition {
  switch (kind) {
    case "SPECIFIC_ASSET":
    case "SPECIFIC_SPACE":
    case "DEPARTMENT_UNIT":
      return "OPERATIONAL_TARGET";
    case "ASSET_TYPE":
    case "SPACE_TYPE":
      return "SUGGESTION_ONLY";
  }
}

export function targetKindFromApplicability(
  kind: OperationalTemplateApplicabilityKind,
): LogAttachmentTargetKind | null {
  switch (kind) {
    case "SPECIFIC_ASSET":
      return "ASSET";
    case "SPECIFIC_SPACE":
      return "SPACE";
    case "DEPARTMENT_UNIT":
      return "UNIT";
    case "ASSET_TYPE":
    case "SPACE_TYPE":
      return null;
  }
}

/**
 * Uniqueness: same Catalog + same target should not create a second Active Attachment
 * with identical timing fingerprint. Distinct timing (e.g. rare split configs) may
 * allow multiples — prefer one Attachment with multiple schedule windows instead.
 */
export function attachmentTimingFingerprint(timing: LogAttachmentTimingConfig): string {
  const windows = timing.dailyWindows
    .map((w) => `${w.label}:${w.startLocal}-${w.endLocal}`)
    .sort()
    .join(",");
  const cycles = [...timing.cycleStableKeys].sort().join(",");
  const cal = timing.calendar
    ? [
        timing.calendar.cadenceType,
        timing.calendar.daysOfWeek.slice().sort((a, b) => a - b).join("."),
        String(timing.calendar.dayOfMonth ?? ""),
        timing.calendar.dueTimeLocal ?? "",
      ].join(":")
    : "";
  return [timing.source, cycles, windows, cal, timing.allowAdHoc ? "adhoc" : ""].join("|");
}

export function targetIdentityKey(target: LogAttachmentTarget, facilityId: string): string {
  switch (target.kind) {
    case "ASSET":
      return `ASSET:${target.assetId}`;
    case "SPACE":
      return `SPACE:${target.spaceId}`;
    case "UNIT":
      return `UNIT:${target.unitId}`;
    case "DEPARTMENT":
      return `DEPARTMENT:${target.departmentId}`;
    case "FACILITY":
      return `FACILITY:${facilityId}`;
  }
}

export function wouldDuplicateActiveAttachment(input: {
  facilityId: string;
  catalogStableKey: string;
  target: LogAttachmentTarget;
  timing: LogAttachmentTimingConfig;
  existing: Array<{
    catalogStableKey: string;
    status: "ACTIVE" | "INACTIVE" | "RETIRED";
    target: LogAttachmentTarget;
    timing: LogAttachmentTimingConfig;
  }>;
}): boolean {
  const targetKey = targetIdentityKey(input.target, input.facilityId);
  const fingerprint = attachmentTimingFingerprint(input.timing);
  return input.existing.some(
    (row) =>
      row.status === "ACTIVE" &&
      row.catalogStableKey === input.catalogStableKey &&
      targetIdentityKey(row.target, input.facilityId) === targetKey &&
      attachmentTimingFingerprint(row.timing) === fingerprint,
  );
}

/** Floor is structural — never a normal Attachment target kind. */
export function isFloorAllowedAsLogTarget(): false {
  return false;
}

export function isFacilityTargetDeferredForV1(): boolean {
  // Supported in contract shape, deferred from default V1 BUILD UX.
  return true;
}
