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
  | "evidence";

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
        description: "Plant Operations is not configured through a meal- or period-style operating rhythm.",
        actionLabel: "View Teams →",
      };
    }
    return {
      status: "Not configured",
      description: "Recurring operating periods have not been added yet.",
      actionLabel: `Use ${product?.name ?? "product"} operating rhythm →`,
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
    actionLabel: hasDrafts ? "Make live on Teams →" : "Manage on Teams →",
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
    return { status: "No people assigned", actionLabel: "Manage employees →" };
  }
  return {
    status: `${memberCount} assigned`,
    actionLabel: "Manage employees →",
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

export function formatEvidenceGuidance(placedLogCount: number): {
  status: string;
  actionLabel: string;
} {
  if (placedLogCount === 0) {
    return { status: "No logs placed", actionLabel: "Configure logs →" };
  }
  return {
    status: placedLogCount === 1 ? "1 log placed" : `${placedLogCount} logs placed`,
    actionLabel: "Configure logs →",
  };
}

export function presentOverviewGuidance(input: OverviewGuidanceInput): OverviewGuidanceRow[] {
  const locations = formatLocationGuidance(input.locationCount);
  const rhythm = formatOperatingRhythmGuidance(input);
  const people = formatPeopleGuidance(input.memberCount);
  const work = formatWorkGuidance(input);
  const evidence = formatEvidenceGuidance(input.placedLogCount);

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
      href: departmentAdminHref(input.departmentId, "teams"),
      actionLabel: rhythm.actionLabel,
      testId: "overview-rhythm-summary",
    },
    {
      id: "people",
      title: "People",
      status: people.status,
      description: "Department membership. Daily assignment is separate.",
      href: `/employees?dept=${encodeURIComponent(input.departmentId)}`,
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
        ? "Published work targets location types with no matching rooms."
        : "Recurring work plans for this department.",
      href: unmatchedTypes
        ? departmentAdminHref(input.departmentId, "locations")
        : "/staffing/work-plans",
      actionLabel: unmatchedTypes ? "Configure locations →" : work.actionLabel,
      testId: "overview-work-summary",
    });
  }

  rows.push({
    id: "evidence",
    title: "Evidence",
    status: evidence.status,
    description: "Logs placed for this department.",
    href: "/build/logs",
    actionLabel: evidence.actionLabel,
    testId: "overview-evidence-summary",
  });

  return rows;
}

function formatList(labels: string[]): string {
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
