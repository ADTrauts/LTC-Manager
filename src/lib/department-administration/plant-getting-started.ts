/**
 * Plant Build Overview — derived Getting Started guidance.
 * Never persisted. Never blocks Run. Not a compliance score.
 */

import { ASSET_BUILD_PATH } from "@/lib/asset-operations/ownership";
import { departmentAdminHref } from "@/lib/department-administration/admin-nav";
import {
  plantStarterHref,
  presentPlantStarterPresenceLabel,
  type PlantStarterPresence,
} from "@/lib/department-products/plant-starter-catalog";

export type PlantGettingStartedStatus = "ready" | "needed" | "optional" | "deferred";

export type PlantGettingStartedItem = {
  id: string;
  step: number;
  title: string;
  status: PlantGettingStartedStatus;
  statusLabel: string;
  href: string | null;
  actionLabel: string | null;
};

export type PlantOverviewFactCounts = {
  locationCount: number;
  assetCount: number;
  peopleCount: number;
  workPlanCount: number;
  recordCount: number;
  publishedPmPlanCount: number;
};

export type PlantGettingStartedInput = PlantOverviewFactCounts & {
  departmentId: string;
  starterPresence?: PlantStarterPresence;
  canInstallStarter?: boolean;
};

export function presentPlantOverviewCounts(input: PlantOverviewFactCounts): Array<{
  id: string;
  label: string;
  value: number;
}> {
  return [
    { id: "locations", label: "Locations", value: input.locationCount },
    { id: "assets", label: "Assets", value: input.assetCount },
    { id: "people", label: "People", value: input.peopleCount },
    { id: "work", label: "Work Plans", value: input.workPlanCount },
    { id: "records", label: "Records", value: input.recordCount },
    { id: "pm", label: "Published PM Plans", value: input.publishedPmPlanCount },
  ];
}

export function presentPlantGettingStarted(input: PlantGettingStartedInput): PlantGettingStartedItem[] {
  const workHref = departmentAdminHref(input.departmentId, "work");
  const recordsHref = departmentAdminHref(input.departmentId, "records");
  const peopleHref = departmentAdminHref(input.departmentId, "people");
  const locationsHref = departmentAdminHref(input.departmentId, "locations");
  const pmHref = departmentAdminHref(input.departmentId, "maintenance");

  return [
    item(1, "locations", "Confirm Locations", input.locationCount > 0, locationsHref, "View Locations"),
    item(2, "assets", "Add or import Assets", input.assetCount > 0, ASSET_BUILD_PATH, "Configure Assets"),
    {
      id: "categories",
      step: 3,
      title: "Confirm maintenance categories",
      status: "ready",
      statusLabel: "Default categories available",
      href: "/repairs",
      actionLabel: "View Work Orders",
    },
    item(4, "people", "Add People & Coverage", input.peopleCount > 0, peopleHref, "Open People & Coverage"),
    {
      id: "starter",
      step: 5,
      title: "Add starter configuration",
      status:
        input.starterPresence === "added"
          ? "ready"
          : input.starterPresence === "partial"
            ? "optional"
            : "optional",
      statusLabel:
        input.starterPresence === "added"
          ? presentPlantStarterPresenceLabel("added")
          : input.starterPresence === "partial"
            ? presentPlantStarterPresenceLabel("partial")
            : "Optional — add recurring Work and Record examples",
      href: input.canInstallStarter === false ? null : plantStarterHref(input.departmentId),
      actionLabel:
        input.canInstallStarter === false
          ? null
          : input.starterPresence === "added"
            ? "Review starter configuration"
            : "Add starter configuration",
    },
    item(6, "work", "Configure recurring Work", input.workPlanCount > 0, workHref, "Open Work", true),
    item(7, "records", "Confirm Records", input.recordCount > 0, recordsHref, "Open Records", true),
    {
      id: "procedures",
      step: 8,
      title: "Add Procedures if needed",
      status: "optional",
      statusLabel: "Optional",
      href: "/admin/knowledge",
      actionLabel: "Open Procedures",
    },
    item(
      9,
      "pm",
      "Create Preventive Maintenance Plans",
      input.publishedPmPlanCount > 0,
      pmHref,
      "Open Maintenance",
      true,
    ),
    {
      id: "operate",
      step: 10,
      title: "Start operating",
      status: "ready",
      statusLabel: "Run is available — this list does not block it",
      href: "/assets",
      actionLabel: "Open Maintenance",
    },
  ];
}

function item(
  step: number,
  id: string,
  title: string,
  ready: boolean,
  href: string,
  actionLabel: string,
  optionalWhenEmpty = false,
): PlantGettingStartedItem {
  if (ready) {
    return { id, step, title, status: "ready", statusLabel: "Configured", href, actionLabel };
  }
  if (optionalWhenEmpty) {
    return { id, step, title, status: "optional", statusLabel: "Optional", href, actionLabel };
  }
  return { id, step, title, status: "needed", statusLabel: "Not configured yet", href, actionLabel };
}
