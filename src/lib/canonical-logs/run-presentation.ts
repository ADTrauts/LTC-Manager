/**
 * RUN presentation helpers for canonical Log requirements.
 * Product language only — no Evidence / MealType / enum jargon.
 */

import type { LogRequirement, LogRequirementProductState } from "@/lib/logs-architecture/types";
import { formatLocalTime12h } from "./timing-display";

export type RunLogGroupId =
  | "due"
  | "overdue"
  | "upcoming"
  | "completed"
  | "needs_review"
  | "needs_setup"
  | "adhoc";

export type RunLogRequirementView = {
  requirementKey: string;
  attachmentId: string;
  departmentId: string;
  operationalDateKey: string;
  displayName: string;
  catalogDefinitionName: string;
  purposeType: string;
  targetLabel: string;
  timingContextLabel: string;
  productState: LogRequirementProductState;
  /** Staff-facing primary label (Due now for DUE). */
  stateLabel: string;
  emphasis: "quiet" | "strong" | "exception" | "setup";
  primaryActionLabel: string | null;
  openHref: string | null;
  viewRecordHref: string | null;
  buildSettingsHref: string | null;
  localInstructions: string | null;
  catalogInstructions: string | null;
  showLocalInstructionsOnCard: boolean;
  cycleStableKey: string | null;
  cycleLabel: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  recordId: string | null;
  fields: LogRequirement["fields"];
  isAdHoc: boolean;
};

export type RunAdHocAttachmentView = {
  attachmentId: string;
  departmentId: string;
  displayName: string;
  catalogDefinitionName: string;
  targetLabel: string;
  startHref: string;
};

/** Assigned in BUILD, not required until a later service day. */
export type UpcomingRunLogView = {
  displayName: string;
  startsOnLabel: string;
  targetLabel: string | null;
};

function stateLabelFor(state: LogRequirementProductState): string {
  switch (state) {
    case "DUE":
      return "Due";
    case "UPCOMING":
      return "Upcoming";
    case "OVERDUE":
      return "Overdue";
    case "COMPLETED":
      return "Completed";
    case "COMPLETED_WITH_EXCEPTION":
      return "Completed with exception";
    case "NEEDS_SETUP":
      return "Needs setup";
    case "NOT_APPLICABLE":
      return "Not applicable";
  }
}

function emphasisFor(state: LogRequirementProductState): RunLogRequirementView["emphasis"] {
  switch (state) {
    case "DUE":
    case "OVERDUE":
      return "strong";
    case "COMPLETED_WITH_EXCEPTION":
      return "exception";
    case "NEEDS_SETUP":
      return "setup";
    default:
      return "quiet";
  }
}

export function formatRunTimingContext(input: {
  cycleLabel: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  windowLabel?: string | null;
  calendarHint?: string | null;
}): string {
  if (input.cycleLabel?.trim()) {
    // Prefer cycle name alone for OPERATIONAL_CYCLE; window times are the cycle bounds.
    return input.cycleLabel.trim();
  }
  const label = input.windowLabel?.trim();
  if (label && input.windowStartLocal && input.windowEndLocal) {
    return `${label} · ${formatLocalTime12h(input.windowStartLocal)}–${formatLocalTime12h(input.windowEndLocal)}`;
  }
  if (label) return label;
  if (input.windowStartLocal && input.windowEndLocal) {
    return `${formatLocalTime12h(input.windowStartLocal)}–${formatLocalTime12h(input.windowEndLocal)}`;
  }
  if (input.calendarHint) return input.calendarHint;
  return "";
}

export function presentRunLogRequirement(input: {
  requirement: LogRequirement;
  catalogDefinitionName: string;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  catalogInstructions: string | null;
  targetLabel: string;
  isManager: boolean;
}): RunLogRequirementView {
  const req = input.requirement;
  const displayName = input.localDisplayLabel?.trim() || input.catalogDefinitionName;
  const timingContextLabel = formatRunTimingContext({
    cycleLabel: req.timingSource === "OPERATIONAL_CYCLE" ? req.cycleLabel : null,
    windowStartLocal: req.windowStartLocal,
    windowEndLocal: req.windowEndLocal,
    windowLabel:
      req.timingSource === "DAILY_WINDOWS" || req.timingSource === "CATALOG_DEFAULT"
        ? req.cycleLabel
        : null,
    calendarHint:
      req.timingSource === "CALENDAR"
        ? req.windowStartLocal
          ? `Due ${formatLocalTime12h(req.windowStartLocal)}`
          : "Scheduled"
        : null,
  });

  const completed =
    req.productState === "COMPLETED" || req.productState === "COMPLETED_WITH_EXCEPTION";
  const needsSetup = req.productState === "NEEDS_SETUP";

  let primaryActionLabel: string | null = null;
  let openHref: string | null = null;
  let viewRecordHref: string | null = null;
  let buildSettingsHref: string | null = null;

  if (completed && req.recordId) {
    primaryActionLabel = "View record";
    viewRecordHref = `/staffing/logs/records/${req.recordId}`;
  } else if (needsSetup) {
    if (input.isManager) {
      primaryActionLabel = "Open Build settings";
      buildSettingsHref = `/build/logs/attachments/${req.attachmentId}`;
    }
  } else if (
    req.productState === "DUE" ||
    req.productState === "OVERDUE" ||
    req.productState === "UPCOMING"
  ) {
    primaryActionLabel = "Open log";
    const params = new URLSearchParams({
      attachmentId: req.attachmentId,
      requirementKey: req.requirementKey,
    });
    openHref = `/staffing/logs/open?${params.toString()}`;
  }

  const local = input.localInstructions?.trim() || null;
  return {
    requirementKey: req.requirementKey,
    attachmentId: req.attachmentId,
    departmentId: req.departmentId,
    operationalDateKey: req.operationalDateKey,
    displayName,
    catalogDefinitionName: input.catalogDefinitionName,
    purposeType: req.purposeType,
    targetLabel: input.targetLabel,
    timingContextLabel,
    productState: req.productState,
    stateLabel: stateLabelFor(req.productState),
    emphasis: emphasisFor(req.productState),
    primaryActionLabel,
    openHref,
    viewRecordHref,
    buildSettingsHref,
    localInstructions: local,
    catalogInstructions: input.catalogInstructions,
    showLocalInstructionsOnCard: Boolean(local && local.length <= 80),
    cycleStableKey: req.cycleStableKey,
    cycleLabel: req.cycleLabel,
    windowStartLocal: req.windowStartLocal,
    windowEndLocal: req.windowEndLocal,
    windowStartsAt: req.windowStartsAt?.toISOString() ?? null,
    windowEndsAt: req.windowEndsAt?.toISOString() ?? null,
    recordId: req.recordId,
    fields: req.fields,
    isAdHoc: false,
  };
}

const GROUP_ORDER: RunLogGroupId[] = [
  "overdue",
  "due",
  "upcoming",
  "needs_review",
  "completed",
  "needs_setup",
  "adhoc",
];

export function groupLabel(id: RunLogGroupId): string {
  switch (id) {
    case "due":
      return "Due now";
    case "overdue":
      return "Overdue";
    case "upcoming":
      return "Upcoming";
    case "completed":
      return "Recent completion";
    case "needs_review":
      return "Needs review";
    case "needs_setup":
      return "Needs setup";
    case "adhoc":
      return "As needed";
  }
}

export function groupRunLogRequirements(
  items: readonly RunLogRequirementView[],
  adHoc: readonly RunAdHocAttachmentView[],
  opts?: { includeNeedsSetup: boolean },
): Array<{ id: RunLogGroupId; label: string; items: RunLogRequirementView[]; adHoc: RunAdHocAttachmentView[] }> {
  const buckets: Record<RunLogGroupId, RunLogRequirementView[]> = {
    due: [],
    overdue: [],
    upcoming: [],
    completed: [],
    needs_review: [],
    needs_setup: [],
    adhoc: [],
  };

  for (const item of items) {
    switch (item.productState) {
      case "DUE":
        buckets.due.push(item);
        break;
      case "OVERDUE":
        buckets.overdue.push(item);
        break;
      case "UPCOMING":
        buckets.upcoming.push(item);
        break;
      case "COMPLETED":
        buckets.completed.push(item);
        break;
      case "COMPLETED_WITH_EXCEPTION":
        buckets.needs_review.push(item);
        break;
      case "NEEDS_SETUP":
        if (opts?.includeNeedsSetup !== false) buckets.needs_setup.push(item);
        break;
      default:
        break;
    }
  }

  return GROUP_ORDER.map((id) => ({
    id,
    label: groupLabel(id),
    items: buckets[id],
    adHoc: id === "adhoc" ? [...adHoc] : [],
  })).filter((g) => g.items.length > 0 || g.adHoc.length > 0);
}

export function productStatusFromEvidenceStatus(
  status: string,
  outOfStandard: boolean,
): { label: string; exception: boolean } {
  if (status === "COMPLETED_WITH_CORRECTIVE_ACTION" || status === "NEEDS_REVIEW" || outOfStandard) {
    return { label: "Completed with exception", exception: true };
  }
  return { label: "Completed", exception: false };
}
