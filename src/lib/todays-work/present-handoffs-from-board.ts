/**
 * Phase 6Q — handoffs from RLS board + presence call-offs only.
 * Does not compose leftover walk / coverage / dashboard lists.
 */

import type { OperationContext } from "@/lib/operations-center";

import type { CallDownData } from "./call-down";
import type {
  HandoffCategory,
  HandoffData,
  HandoffItem,
  HandoffPriority,
  HandoffSection,
} from "./handoffs";
import { summarizeHandoffs } from "./handoffs";
import { operatingLocationStatusLabel } from "./operating-locations";
import type { OperatingLocationBoard, OperatingLocationStatus } from "./operating-locations/types";

function categoryFromLocation(location: OperatingLocationStatus): {
  category: HandoffCategory;
  categoryLabel: string;
  priority: HandoffPriority;
} {
  const kinds = new Set(location.issues.map((issue) => issue.kind));
  if (kinds.has("repair")) {
    return { category: "open_repair", categoryLabel: "Open issue", priority: "high" };
  }
  if (kinds.has("log")) {
    return { category: "log_exception", categoryLabel: "Log exception", priority: "critical" };
  }
  if (location.derivedStatus === "needs_attention") {
    return { category: "log_exception", categoryLabel: "Needs attention", priority: "high" };
  }
  return { category: "meal_service", categoryLabel: "In progress", priority: "normal" };
}

function itemFromLocation(location: OperatingLocationStatus): HandoffItem {
  const { category, categoryLabel, priority } = categoryFromLocation(location);
  const issueDetail =
    location.issueSummary ??
    location.issues.map((issue) => issue.label).filter(Boolean).join(" · ") ??
    null;
  return {
    id: `location:${location.location.id}`,
    category,
    categoryLabel,
    priority,
    title: location.displayName,
    detail:
      issueDetail ||
      location.currentOperation.detail ||
      operatingLocationStatusLabel(location.derivedStatus),
    unitId: location.location.unitId,
    unitName: location.displayName,
    primaryHref: location.href,
    primaryLabel: "Open location",
    secondaryHref: "/today",
    secondaryLabel: "Hub",
  };
}

function itemFromCallOff(item: CallDownData["items"][number]): HandoffItem {
  const movement =
    item.oldUnitName && item.oldUnitName !== item.newUnitName
      ? `${item.oldUnitName} → ${item.newUnitName}`
      : item.oldUnitName ?? item.newUnitName;
  return {
    id: `call-off:${item.id}`,
    category: "call_down",
    categoryLabel: "Call-off",
    priority: "high",
    title: item.employeeName,
    detail: movement ? `${item.reason} · ${movement}` : item.reason,
    unitId: item.oldUnitId ?? item.newUnitId,
    unitName: item.oldUnitName ?? item.newUnitName,
    primaryHref: item.staffingHref,
    primaryLabel: "Staffing",
    secondaryHref: item.coverageHref,
    secondaryLabel: "Assignments",
  };
}

export function presentHandoffsFromBoard(input: {
  board: OperatingLocationBoard;
  callOffs: CallDownData;
  operationContext: OperationContext;
}): HandoffData {
  const locationItems = input.board.locations
    .filter(
      (location) =>
        location.derivedStatus === "needs_attention" || location.derivedStatus === "in_progress",
    )
    .map(itemFromLocation);

  const callOffItems = input.callOffs.items.map(itemFromCallOff);

  const sections: HandoffSection[] = [];
  if (locationItems.length > 0) {
    sections.push({
      key: "locations",
      title: "Locations needing follow-up",
      description: "Current location state from Runtime Location State.",
      items: locationItems,
    });
  }
  if (callOffItems.length > 0) {
    sections.push({
      key: "call-offs",
      title: "Call-offs today",
      description: "Presence facts logged today. Not a coverage score.",
      items: callOffItems,
    });
  }

  return {
    sections,
    summary: summarizeHandoffs(sections),
    operationContext: input.operationContext,
    isClear: sections.length === 0,
  };
}
