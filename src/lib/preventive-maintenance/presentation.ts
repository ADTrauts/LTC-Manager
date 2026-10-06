/**
 * Product-facing Preventive Maintenance Build presentation.
 * Cadence presets are UI-only. Persistence remains intervalMonths.
 */

import type { RepairPriority } from "@prisma/client";

import { presentWorkOrderPriority } from "@/lib/asset-operations/work-order-semantics";
import { isAssetLifecycleRetired } from "@/lib/asset-operations/ownership";
import { isPmPlanGenerationEligible, pmIneligibilityReason } from "./eligibility";
import type { CivilDate } from "./civil-date";
import { compareCivilDates, parseCivilDate, civilDateParts } from "./civil-date";
import {
  addCivilDays,
  addMonthsClamped,
  projectPmSchedule,
  type ProjectedPmScheduledDate,
} from "./schedule";

export const PM_CADENCE_PRESETS = [
  { id: "monthly", label: "Monthly", intervalMonths: 1 },
  { id: "quarterly", label: "Quarterly", intervalMonths: 3 },
  { id: "semiannual", label: "Semiannual", intervalMonths: 6 },
  { id: "annual", label: "Annual", intervalMonths: 12 },
] as const;

export type PmCadencePresetId = (typeof PM_CADENCE_PRESETS)[number]["id"] | "custom";

export const PM_PRIORITY_OPTIONS = [
  { id: "ROUTINE", label: "Routine" },
  { id: "HIGH", label: "High" },
  { id: "URGENT", label: "Urgent" },
] as const;

export type PmBuilderPriority = (typeof PM_PRIORITY_OPTIONS)[number]["id"];

export type PmPlanStatusPresentation = {
  key: "DRAFT" | "PUBLISHED" | "PUBLISHED_DRAFT" | "RETIRED";
  label: string;
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function intervalMonthsFromCadencePreset(
  preset: PmCadencePresetId,
  customMonths?: number,
): number {
  if (preset === "custom") {
    return customMonths ?? 1;
  }
  const found = PM_CADENCE_PRESETS.find((row) => row.id === preset);
  return found?.intervalMonths ?? 1;
}

export function cadencePresetFromIntervalMonths(intervalMonths: number): PmCadencePresetId {
  const found = PM_CADENCE_PRESETS.find((row) => row.intervalMonths === intervalMonths);
  return found?.id ?? "custom";
}

export function formatCadenceSummary(intervalMonths: number): string {
  if (intervalMonths === 1) return "Monthly";
  if (intervalMonths === 3) return "Quarterly";
  if (intervalMonths === 6) return "Semiannual";
  if (intervalMonths === 12) return "Annual";
  return `Every ${intervalMonths} months`;
}

export function presentPmPriority(priority: RepairPriority | string | null | undefined): string {
  if (priority === "EMERGENCY") return "Emergency";
  const presented = presentWorkOrderPriority(priority);
  if (presented === "ROUTINE") return "Routine";
  if (presented === "HIGH") return "High";
  if (presented === "URGENT") return "Urgent";
  return "Routine";
}

export function persistPmPriority(priority: string | null | undefined): RepairPriority {
  if (priority === "HIGH") return "HIGH";
  if (priority === "URGENT") return "URGENT";
  if (priority === "EMERGENCY") return "EMERGENCY";
  if (priority === "LOW") return "LOW";
  if (priority === "MEDIUM") return "MEDIUM";
  if (priority === "ROUTINE") return "MEDIUM";
  return "MEDIUM";
}

export function presentPmPlanStatus(input: {
  planStatus: string;
  hasSuccessorDraft: boolean;
}): PmPlanStatusPresentation {
  if (input.planStatus === "RETIRED") {
    return { key: "RETIRED", label: "Retired" };
  }
  if (input.planStatus === "DRAFT") {
    return { key: "DRAFT", label: "Draft" };
  }
  if (input.planStatus === "PUBLISHED" && input.hasSuccessorDraft) {
    return { key: "PUBLISHED_DRAFT", label: "Published · Draft changes" };
  }
  return { key: "PUBLISHED", label: "Published" };
}

export function formatProjectedDateLabel(date: CivilDate | Date, opts?: { includeYear?: boolean }): string {
  const key = parseCivilDate(date);
  const { year, month, day } = civilDateParts(key);
  const monthLabel = MONTH_LABELS[month - 1] ?? String(month);
  if (opts?.includeYear) {
    return `${monthLabel} ${day}, ${year}`;
  }
  return `${monthLabel} ${day}`;
}

export function defaultSuccessorEffectiveDate(
  facilityToday: CivilDate | Date,
  priorEffectiveDate?: CivilDate | Date | null,
): CivilDate {
  const today = parseCivilDate(facilityToday);
  if (!priorEffectiveDate) return today;
  const prior = parseCivilDate(priorEffectiveDate);
  if (compareCivilDates(today, prior) > 0) return today;
  return addCivilDays(prior, 1);
}

const PREVIEW_CYCLES = 4;

/**
 * Projected schedule for a draft configuration.
 * Uses Phase 4A `projectPmSchedule` with a synthetic published version.
 * Does not persist occurrence rows.
 */
export function previewDraftProjectedSchedule(input: {
  intervalMonths: number;
  anchorDate: CivilDate | Date;
  effectiveDate: CivilDate | Date;
  cycles?: number;
}): ProjectedPmScheduledDate[] {
  const effective = parseCivilDate(input.effectiveDate);
  const cycles = input.cycles ?? PREVIEW_CYCLES;
  const through = addMonthsClamped(effective, input.intervalMonths * Math.max(1, cycles));
  return projectPmSchedule(
    [
      {
        id: "draft-preview",
        status: "PUBLISHED",
        effectiveDate: effective,
        intervalMonths: input.intervalMonths,
        anchorDate: input.anchorDate,
      },
    ],
    { fromInclusive: effective, throughInclusive: through },
  ).slice(0, cycles);
}

export function nextProjectedScheduledDate(input: {
  versions: Array<{
    id: string;
    status: string;
    effectiveDate: CivilDate | Date | null;
    intervalMonths: number;
    anchorDate: CivilDate | Date;
  }>;
  facilityToday: CivilDate | Date;
  draft?: {
    intervalMonths: number;
    anchorDate: CivilDate | Date;
    effectiveDate: CivilDate | Date | null;
  } | null;
}): CivilDate | null {
  const today = parseCivilDate(input.facilityToday);
  const through = addMonthsClamped(today, 24);
  const projected = projectPmSchedule(input.versions, {
    fromInclusive: today,
    throughInclusive: through,
  });
  const next = projected.find((row) => compareCivilDates(row.scheduledDate, today) >= 0);
  if (next) return next.scheduledDate;
  if (input.draft?.effectiveDate) {
    const draftDates = previewDraftProjectedSchedule({
      intervalMonths: input.draft.intervalMonths,
      anchorDate: input.draft.anchorDate,
      effectiveDate: input.draft.effectiveDate,
    });
    return draftDates[0]?.scheduledDate ?? null;
  }
  return null;
}

export function pmGenerationWarning(input: {
  planStatus: string;
  assetStatus: string;
}): { tone: "paused" | "notice"; title: string; detail: string } | null {
  const ineligible = pmIneligibilityReason({
    planStatus: input.planStatus,
    assetStatus: input.assetStatus,
  });
  if (ineligible === "ASSET_RETIRED" && input.planStatus === "PUBLISHED") {
    return {
      tone: "paused",
      title: "Generation paused",
      detail: "Asset is retired",
    };
  }
  if (isAssetLifecycleRetired(input.assetStatus) && input.planStatus !== "RETIRED") {
    return {
      tone: "paused",
      title: "Asset is retired",
      detail: "This Asset cannot be used for new Preventive Maintenance publication.",
    };
  }
  if (input.assetStatus === "OUT_OF_SERVICE" && isPmPlanGenerationEligible(input)) {
    return {
      tone: "notice",
      title: "Asset currently out of service",
      detail: "Preventive Maintenance remains active.",
    };
  }
  return null;
}
