/**
 * Legacy Logs compatibility map (Phase 2 — strategies only, no migration).
 */

import type {
  LegacyCutoverPhase,
  LegacyLogTemplateMappingClass,
  LogsDomainBoundary,
} from "./types";

export const LOGS_DOMAIN_BOUNDARY: LogsDomainBoundary = {
  logsUmbrellaIncludes: ["LOG", "CHECKLIST"],
  inspectionsRemainSeparate: true,
  mealPeriodIsNotTimingAuthority: true,
  typeApplicabilityIsSuggestionOnly: true,
  canonicalRunStore: "OperationalEvidenceRecord",
};

export const LEGACY_CUTOVER_PHASES: ReadonlyArray<{
  phase: LegacyCutoverPhase;
  summary: string;
}> = [
  {
    phase: "A_COEXIST",
    summary:
      "Catalog + Attachment exist alongside legacy LogTemplate/Assignment/Submission. Both writable.",
  },
  {
    phase: "B_NEW_EVIDENCE_ONLY",
    summary:
      "New facility Attachments create only Evidence-based RUN Logs. Legacy assignments still run.",
  },
  {
    phase: "C_LEGACY_READ_ONLY",
    summary: "Legacy creation/assignment UI becomes read-only or deprecated.",
  },
  {
    phase: "D_HISTORY_PRESERVED",
    summary:
      "Historical LogSubmission rows remain readable indefinitely; history UI may unify display.",
  },
] as const;

export type LegacyTemplateMappingStrategy = {
  classify(templateName: string, category: string): LegacyLogTemplateMappingClass | "UNCLASSIFIED";
  notes: string;
};

/**
 * Placeholder classifier — Phase 3+ performs real mapping.
 * Name/category heuristics only for contract tests.
 */
export function classifyLegacyLogTemplate(input: {
  name: string;
  category: string;
}): LegacyLogTemplateMappingClass | "UNCLASSIFIED" {
  const name = input.name.trim().toLowerCase();
  const category = input.category.trim().toLowerCase();
  if (name.includes("obsolete") || name.includes("deprecated") || name.includes("(old)")) {
    return "OBSOLETE_DUPLICATE";
  }
  if (
    category === "temperature" ||
    category === "sanitation" ||
    category === "food service" ||
    name.includes("cooler") ||
    name.includes("freezer") ||
    name.includes("dishwasher") ||
    name.includes("temp")
  ) {
    return "MATCHES_CATALOG";
  }
  if (name.startsWith("custom") || name.includes("facility")) {
    return "FACILITY_CUSTOM";
  }
  return "UNCLASSIFIED";
}

export type LegacyAssignmentMappingHint = {
  /** Unit LogAssignment → Unit Attachment candidate. */
  targetKind: "UNIT";
  /**
   * PER_MEAL / mealType assignments must map to Operational Cycle selection,
   * never reintroduce MealType as timing authority.
   */
  mealTypeRequiresCycleSelection: boolean;
  timingSourceHint: "OPERATIONAL_CYCLE" | "DAILY_WINDOWS" | "CATALOG_DEFAULT" | "AD_HOC";
};

export function hintLegacyAssignmentMapping(input: {
  recurrence: "DAILY" | "PER_MEAL" | "WEEKLY" | "CUSTOM";
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | null;
}): LegacyAssignmentMappingHint {
  if (input.recurrence === "PER_MEAL" || input.mealType != null) {
    return {
      targetKind: "UNIT",
      mealTypeRequiresCycleSelection: true,
      timingSourceHint: "OPERATIONAL_CYCLE",
    };
  }
  if (input.recurrence === "DAILY") {
    return {
      targetKind: "UNIT",
      mealTypeRequiresCycleSelection: false,
      timingSourceHint: "CATALOG_DEFAULT",
    };
  }
  if (input.recurrence === "WEEKLY") {
    return {
      targetKind: "UNIT",
      mealTypeRequiresCycleSelection: false,
      timingSourceHint: "DAILY_WINDOWS",
    };
  }
  return {
    targetKind: "UNIT",
    mealTypeRequiresCycleSelection: false,
    timingSourceHint: "AD_HOC",
  };
}

export const ROUTE_ROLES = {
  logs: {
    path: "/logs",
    phaseA: "compatibility_run_and_legacy_build",
    phaseC: "legacy_history_or_redirect",
  },
  staffingTemplates: {
    path: "/staffing/templates",
    phaseA: "facility_department_template_compat_not_corp_catalog",
    future: "may_seed_or_mirror_catalog_but_must_not_be_corp_authoring_for_facility_users",
  },
  staffingLogBook: {
    path: "/staffing/log-book",
    phaseA: "canonical_run_history_foundation",
  },
  adminInspections: {
    path: "/admin/inspections",
    boundary: "separate_inspection_domain",
  },
} as const;
