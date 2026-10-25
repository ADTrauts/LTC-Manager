import { isPartnerFacilitySession } from "@/lib/auth";

import type {
  DashboardCapability,
  DepartmentDashboardCapabilities,
  NotConfiguredReason,
} from "../capabilities";
import { isDashboardHrefAuthorized } from "../drill-down";
import {
  DASHBOARD_AUTHORITY_RANK,
  type DashboardDepartmentAccessMode,
  type DashboardViewer,
} from "../viewer/types";

import { DASHBOARD_CARDS } from "./registry";
import type { CapabilityRequirement, DashboardCardDefinition, DrillDown } from "./types";

export type EligibleDashboardCard = {
  card: DashboardCardDefinition;
  /** `summary` renders the summary model only; `not_configured` renders the setup reason. */
  form: "full" | "summary" | "not_configured";
  accessMode: DashboardDepartmentAccessMode;
  /** The header link after access-mode rules, or null for no link. */
  drillDown: Pick<DrillDown, "href" | "intent"> | null;
  /** Card actions and write Shortcuts render only in MANAGE. */
  actionsAllowed: boolean;
  notConfigured: NotConfiguredReason | null;
  /** Fix links only for viewers who hold MANAGE and lead the Department or administer the facility. */
  canFix: boolean;
};

export type DashboardCapabilityMap = ReadonlyMap<string, DepartmentDashboardCapabilities>;

function satisfiedBy(
  requirement: Extract<CapabilityRequirement, { kind: "capabilities" }>,
  capabilities: DepartmentDashboardCapabilities | undefined,
): boolean {
  if (!capabilities) return false;
  const has = capabilities.has;
  if (requirement.allOf && !requirement.allOf.every((capability) => has.has(capability))) return false;
  if (requirement.anyOf && requirement.anyOf.length > 0) {
    return requirement.anyOf.some((capability) => has.has(capability));
  }
  return true;
}

function requirementMet(
  requirement: CapabilityRequirement,
  viewer: DashboardViewer,
  departmentId: string | null,
  capabilities: DashboardCapabilityMap,
): boolean {
  switch (requirement.kind) {
    case "none":
      return true;
    case "any_department":
      return viewer.scopeDepartmentIds.length > 0;
    case "capabilities":
      if (departmentId) return satisfiedBy(requirement, capabilities.get(departmentId));
      return viewer.scopeDepartmentIds.some((id) => satisfiedBy(requirement, capabilities.get(id)));
  }
}

/** A missing `records.canonical` is reported through the legacy Records reason (DSH-D19). */
function reasonCapability(capability: DashboardCapability): DashboardCapability {
  return capability === "records.canonical" ? "records.legacy" : capability;
}

function missingConfigurationReason(
  requirement: CapabilityRequirement,
  capabilities: DepartmentDashboardCapabilities | undefined,
): NotConfiguredReason | null {
  if (requirement.kind !== "capabilities" || !capabilities) return null;
  const has = capabilities.has;
  const missing = [
    ...(requirement.allOf ?? []).filter((capability) => !has.has(capability)),
    ...(requirement.anyOf && !requirement.anyOf.some((capability) => has.has(capability))
      ? requirement.anyOf
      : []),
  ];
  for (const capability of missing) {
    const wanted = reasonCapability(capability);
    const reason = capabilities.notConfigured.find((row) => row.capability === wanted);
    if (reason) return reason;
  }
  return null;
}

/** At Facility scope, links follow View rules unless the viewer manages every Department. */
function facilityAccessMode(viewer: DashboardViewer): DashboardDepartmentAccessMode {
  return viewer.scopeDepartmentIds.every((id) => viewer.departmentAccess[id] === "MANAGE") ? "MANAGE" : "VIEW";
}

function applyAccessMode(
  drillDown: DrillDown | undefined,
  mode: DashboardDepartmentAccessMode,
): EligibleDashboardCard["drillDown"] {
  if (!drillDown || mode === "SUMMARY") return null;
  if (mode === "VIEW" && drillDown.intent === "manage") {
    return drillDown.viewHref ? { href: drillDown.viewHref, intent: "view" } : null;
  }
  return { href: drillDown.href, intent: drillDown.intent };
}

/**
 * Cards this viewer may see in the current scope. Pure: evaluated on every render, so a
 * saved layout never adds visibility.
 */
export function listEligibleCards(
  viewer: DashboardViewer,
  capabilities: DashboardCapabilityMap,
  registry: readonly DashboardCardDefinition[] = DASHBOARD_CARDS,
  options: { keepUnlinked?: boolean } = {},
): EligibleDashboardCard[] {
  const scope = viewer.scope;
  if (!scope) return [];
  const departmentId = scope.kind === "FACILITY" ? null : scope.departmentId;
  const mode = departmentId ? viewer.departmentAccess[departmentId] : facilityAccessMode(viewer);
  if (!mode) return [];
  const isFixer = viewer.authority === "DEPARTMENT_LEADER" || viewer.authority === "FACILITY_ADMINISTRATOR";

  const eligible: EligibleDashboardCard[] = [];
  for (const card of registry) {
    if (!card.scopes.includes(scope.kind)) continue;
    if (DASHBOARD_AUTHORITY_RANK[viewer.authority] < DASHBOARD_AUTHORITY_RANK[card.minAuthority]) continue;
    if (mode === "SUMMARY" && !card.summary) continue;

    let form: EligibleDashboardCard["form"] = mode === "SUMMARY" ? "summary" : "full";
    let notConfigured: NotConfiguredReason | null = null;
    if (!requirementMet(card.requires, viewer, departmentId, capabilities)) {
      const reason =
        departmentId && mode !== "SUMMARY" && isFixer
          ? missingConfigurationReason(card.requires, capabilities.get(departmentId))
          : null;
      if (!reason) continue;
      form = "not_configured";
      notConfigured = reason;
    }

    const drillDowns = card.drillDowns(departmentId);
    const reachable = drillDowns.filter(
      (drillDown) =>
        isDashboardHrefAuthorized(viewer, drillDown.href) &&
        (!drillDown.viewHref || isDashboardHrefAuthorized(viewer, drillDown.viewHref)),
    );
    const partner = isPartnerFacilitySession(viewer.session);
    if (card.drillDownRequired && reachable.length !== drillDowns.length && !options.keepUnlinked && !partner) {
      continue;
    }

    eligible.push({
      card,
      form,
      accessMode: mode,
      drillDown: applyAccessMode(reachable[0], mode),
      actionsAllowed: mode === "MANAGE",
      notConfigured,
      canFix: mode === "MANAGE" && isFixer,
    });
  }
  return eligible;
}
