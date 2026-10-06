/**
 * Derived Department Builder Overview guidance.
 * Facts only — no persisted readiness / setup lifecycle.
 */

import { getDepartmentProduct } from "@/lib/department-products";
import { departmentAdminHref } from "@/lib/department-administration/admin-nav";

export type OverviewGuidanceRowId =
  | "locations"
  | "rhythm"
  | "people"
  | "work"
  | "records";

export type OverviewGuidanceRow = {
  id: OverviewGuidanceRowId;
  title: string;
  status: string;
  description: string;
  href: string;
  actionLabel: string;
  testId: string;
};

export type OverviewGuidanceInput = {
  departmentId: string;
  departmentKey: string;
  departmentName: string;
  locationCount: number;
  currentRootLabels: string[];
  draftRootCount: number;
  scheduledCount: number;
  scheduledEffectiveFrom: string | null;
  memberCount: number;
  publishedWorkPlanCount: number;
  draftWorkPlanCount: number;
  placedLogCount: number;
  publishedWorkOperationalTypeKeys?: readonly string[];
  classifiedOperationalTypeKeys?: readonly string[];
  mealTimingUpgradeRequired?: boolean;
};

export type OverviewProductIdentity = {
  name: string;
  isVssylProduct: boolean;
};

export function resolveOverviewProductIdentity(departmentKey: string): OverviewProductIdentity {
  const product = getDepartmentProduct(departmentKey);
  if (!product) {
    return { name: departmentKey, isVssylProduct: false };
  }
  return { name: product.name, isVssylProduct: true };
}

export function formatOperatingRhythmGuidance(input: {
  departmentKey: string;
  currentRootLabels: string[];
  draftRootCount: number;
  scheduledCount: number;
  scheduledEffectiveFrom: string | null;
  mealTimingUpgradeRequired?: boolean;
}): { status: string; description: string; actionLabel: string } {
  const product = getDepartmentProduct(input.departmentKey);
  const hasStarter = Boolean(product?.starters.cycleStarter);
  const live = input.currentRootLabels.filter(Boolean);
  const hasLive = live.length > 0;
  const hasDrafts = input.draftRootCount > 0;
  const hasScheduled = input.scheduledCount > 0;

  if (!hasLive && !hasDrafts && !hasScheduled) {
    if (!hasStarter) {
      return {
        status: "Not required for this Department Product",
        description: "Operational Cycles are optional for Facility Plant Operations.",
        actionLabel: "Open People & Coverage →",
      };
    }
    return {
      status: "Not configured",
      description: "Recurring operating periods have not been added yet.",
      actionLabel: `Use ${product?.defaultDepartmentName ?? product?.name ?? "product"} operating rhythm →`,
    };
  }

  const parts: string[] = [];
  if (hasLive) {
    parts.push(`${formatList(live)} live`);
  }
  if (hasDrafts) {
    parts.push(
      input.draftRootCount === 1
        ? "1 draft not live"
        : `${input.draftRootCount} drafts not live`,
    );
  }
  if (hasScheduled) {
    parts.push(
      input.scheduledEffectiveFrom
        ? `Changes scheduled for ${input.scheduledEffectiveFrom}`
        : "Changes scheduled",
    );
  }

  return {
    status: parts.join(" · "),
    description: "Recurring operating rhythm.",
    actionLabel: hasDrafts ? "Publish from Operating Rhythm →" : "Open Operating Rhythm →",
  };
}

export function formatLocationGuidance(locationCount: number): {
  status: string;
  description: string;
  href: string;
  actionLabel: string;
} {
  if (locationCount === 0) {
    return {
      status: "No locations assigned",
      description: "Assign rooms in Facility Builder. Department Builder inspects responsibility.",
      href: "/admin/facility/builder",
      actionLabel: "Configure facility locations →",
    };
  }
  return {
    status: `${locationCount} assigned`,
    description: "Where this department operates.",
    href: "",
    actionLabel: "View locations →",
  };
}

export function formatPeopleGuidance(memberCount: number): {
  status: string;
  actionLabel: string;
} {
  if (memberCount === 0) {
    return { status: "No people assigned", actionLabel: "Open People & Coverage →" };
  }
  return {
    status: `${memberCount} assigned`,
    actionLabel: "Open People & Coverage →",
  };
}

export function formatWorkGuidance(input: {
  departmentKey: string;
  publishedWorkPlanCount: number;
  draftWorkPlanCount: number;
}): { applicable: boolean; status: string; actionLabel: string } {
  const product = getDepartmentProduct(input.departmentKey);
  const hasPresets = Boolean(product?.starters.workPresets);
  if (
    !hasPresets &&
    input.departmentKey !== "PLANT" &&
    input.publishedWorkPlanCount === 0 &&
    input.draftWorkPlanCount === 0
  ) {
    return { applicable: false, status: "", actionLabel: "" };
  }
  if (input.publishedWorkPlanCount === 0 && input.draftWorkPlanCount === 0) {
    return {
      applicable: true,
      status: "No recurring work configured",
      actionLabel: "Configure work →",
    };
  }
  const parts: string[] = [];
  if (input.publishedWorkPlanCount > 0) {
    parts.push(
      input.publishedWorkPlanCount === 1
        ? "1 live work plan"
        : `${input.publishedWorkPlanCount} live work plans`,
    );
  }
  if (input.draftWorkPlanCount > 0) {
    parts.push(
      input.draftWorkPlanCount === 1
        ? "1 draft not live"
        : `${input.draftWorkPlanCount} drafts not live`,
    );
  }
  return { applicable: true, status: parts.join(" · "), actionLabel: "Configure work →" };
}

export function hasUnmatchedPublishedOperationalTypes(input: {
  publishedWorkOperationalTypeKeys?: readonly string[];
  classifiedOperationalTypeKeys?: readonly string[];
}): boolean {
  const published = (input.publishedWorkOperationalTypeKeys ?? []).filter(Boolean);
  if (!published.length) return false;
  const classified = new Set(input.classifiedOperationalTypeKeys ?? []);
  return published.some((key) => !classified.has(key));
}

export function formatRecordsGuidance(placedLogCount: number): {
  status: string;
  actionLabel: string;
} {
  if (placedLogCount === 0) {
    return { status: "No records required yet", actionLabel: "Configure records →" };
  }
  return {
    status: placedLogCount === 1 ? "1 record requirement" : `${placedLogCount} record requirements`,
    actionLabel: "Configure records →",
  };
}

/** @deprecated Use formatRecordsGuidance. */
export function formatEvidenceGuidance(placedLogCount: number) {
  return formatRecordsGuidance(placedLogCount);
}

export function presentOverviewGuidance(input: OverviewGuidanceInput): OverviewGuidanceRow[] {
  const locations = formatLocationGuidance(input.locationCount);
  const rhythm = formatOperatingRhythmGuidance(input);
  if (input.mealTimingUpgradeRequired) {
    rhythm.status = rhythm.status
      ? `${rhythm.status} · MEAL_TIMING_UPGRADE_REQUIRED`
      : "MEAL_TIMING_UPGRADE_REQUIRED";
    rhythm.description =
      "Published meal Cycles still use legacy timing. Prepare a draft successor. It is not published automatically.";
    rhythm.actionLabel = "Prepare timing upgrade";
  }
  const people = formatPeopleGuidance(input.memberCount);
  const work = formatWorkGuidance(input);
  const records = formatRecordsGuidance(input.placedLogCount);

  const rows: OverviewGuidanceRow[] = [
    {
      id: "locations",
      title: "Locations",
      status: locations.status,
      description: locations.description,
      href: locations.href || departmentAdminHref(input.departmentId, "locations"),
      actionLabel: locations.actionLabel,
      testId: "overview-locations-summary",
    },
    {
      id: "rhythm",
      title: "Operating rhythm",
      status: rhythm.status,
      description: rhythm.description,
      href: departmentAdminHref(input.departmentId, "operating-rhythm"),
      actionLabel: rhythm.actionLabel,
      testId: "overview-rhythm-summary",
    },
    {
      id: "people",
      title: "People & Coverage",
      status: people.status,
      description: "Teams and coverage for this department. Employee identity stays in People.",
      href: departmentAdminHref(input.departmentId, "people"),
      actionLabel: people.actionLabel,
      testId: "overview-people-summary",
    },
  ];

  if (work.applicable) {
    const unmatchedTypes = hasUnmatchedPublishedOperationalTypes(input);
    rows.push({
      id: "work",
      title: "Work",
      status: work.status,
      description: unmatchedTypes
        ? "Published work targets a Location Function with no bound room."
        : "Work plans for this department. Assignment does not define the work.",
      href: unmatchedTypes
        ? departmentAdminHref(input.departmentId, "locations")
        : departmentAdminHref(input.departmentId, "work"),
      actionLabel: unmatchedTypes ? "Configure locations →" : work.actionLabel,
      testId: "overview-work-summary",
    });
  }

  rows.push({
    id: "records",
    title: "Records",
    status: records.status,
    description: "Readings, checklists, inspections, and acknowledgements.",
    href: departmentAdminHref(input.departmentId, "records"),
    actionLabel: records.actionLabel,
    testId: "overview-evidence-summary",
  });

  return rows;
}

function formatList(labels: string[]): string {
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
