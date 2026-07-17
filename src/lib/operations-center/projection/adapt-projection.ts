/**
 * Wave 15J — Operations Center Projection adapter.
 *
 * Pure: ProjectionSnapshot → ProjectedOperationsCenterScope.
 * Does not interpret department strings or capability arrays as eligibility.
 * Consumes the ProjectionSnapshot only.
 */

import {
  getExperienceTool,
  requireExperience,
  type ExperienceToolKey,
} from "@/lib/experiences";
import type {
  ProjectionDiagnostic,
  ProjectionExperience,
  ProjectionLocationNode,
  ProjectionQueryScope,
  ProjectionSnapshot,
} from "@/lib/projection";

import {
  OPERATIONS_CENTER_CARD_IDS,
  type OperationsCenterCardId,
} from "../card-registry";

import type {
  OcActionEntry,
  OcAreaContributor,
  OcContributionKind,
  OcDepartmentSection,
  OcDestinationHandle,
  OcExperienceContributor,
  OcQueryScopesByDomain,
  OcToolEntry,
  ProjectedOperationsCenterScope,
} from "./types";

function collectLocationIds(roots: readonly ProjectionLocationNode[]): {
  unitIds: Set<string>;
  spaceIds: Set<string>;
  actionableUnitIds: Set<string>;
} {
  const unitIds = new Set<string>();
  const spaceIds = new Set<string>();
  const actionableUnitIds = new Set<string>();

  const visit = (node: ProjectionLocationNode) => {
    const ref = node.reference;
    if (ref.kind === "UNIT") {
      unitIds.add(ref.unitId);
      if (node.presentation === "ACTIONABLE") {
        actionableUnitIds.add(ref.unitId);
      }
    }
    if (ref.kind === "SPACE") {
      unitIds.add(ref.unitId);
      spaceIds.add(ref.spaceId);
      if (node.presentation === "ACTIONABLE") {
        actionableUnitIds.add(ref.unitId);
      }
    }
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return { unitIds, spaceIds, actionableUnitIds };
}

function toolEntries(keys: readonly ExperienceToolKey[]): OcToolEntry[] {
  return keys.map((key) => ({
    key,
    name: getExperienceTool(key)?.name ?? key,
  }));
}

function actionEntries(experience: ProjectionExperience): OcActionEntry[] {
  const allowed = new Set(experience.permissions.allowedActionKeys);
  return experience.actions
    .filter((action) => allowed.has(action.key))
    .map((action) => ({ key: action.key, label: action.label }));
}

/**
 * Derive OC contribution kinds from Experience contracts (domains + tools +
 * status keys). No department-name branching.
 */
export function contributionKindsFromContracts(input: {
  domains: readonly string[];
  tools: readonly ExperienceToolKey[];
  readinessSignalKeys: readonly string[];
  hasNavigation: boolean;
}): OcContributionKind[] {
  const kinds = new Set<OcContributionKind>();
  const domains = input.domains.map((d) => d.toLowerCase());
  const tools = new Set(input.tools);

  if (input.readinessSignalKeys.length > 0) {
    kinds.add("readiness");
  }
  if (input.hasNavigation) {
    kinds.add("navigation");
  }

  const domainMatches = (...needles: string[]) =>
    domains.some((d) => needles.some((n) => d === n || d.includes(n)));

  if (
    domainMatches(
      "meal_service",
      "meal_times",
      "operations",
      "production",
      "nourishments",
      "tray_accuracy",
    )
  ) {
    kinds.add("operations");
    kinds.add("staffing");
    kinds.add("outstanding_work");
  }

  if (
    domainMatches(
      "temperature_logs",
      "food_safety",
      "sanitation",
      "haccp",
      "temperature",
    ) ||
    tools.has("LOGS")
  ) {
    kinds.add("compliance_logs");
  }

  if (
    domainMatches(
      "cleaning",
      "room_cleaning",
      "room_status",
      "cleaning_lists",
      "project_cleaning",
    )
  ) {
    kinds.add("staffing");
    kinds.add("outstanding_work");
    kinds.add("readiness");
  }

  if (
    domainMatches(
      "assets",
      "equipment",
      "work_orders",
      "work_order",
      "preventive_maintenance",
      "pm",
      "utilities",
      "repairs",
    )
  ) {
    kinds.add("issues_repairs");
    kinds.add("outstanding_work");
  }

  if (
    domainMatches("audit", "inspection", "compliance") ||
    tools.has("FORMS")
  ) {
    kinds.add("inspections");
  }

  if (domainMatches("staffing", "assignment", "coverage")) {
    kinds.add("staffing");
  }

  if (tools.has("TASKS")) {
    kinds.add("outstanding_work");
  }

  return [...kinds];
}

function destinationHandlesFor(
  experience: ProjectionExperience,
): OcDestinationHandle[] {
  return experience.navigation.entries.map((entry) => {
    const href = resolveDestinationHref(experience.reference.experienceKey, entry.id);
    return {
      id: entry.id,
      label: entry.label,
      href,
      experienceKey: experience.reference.experienceKey,
    };
  });
}

/** Preserve existing routes only — map known Experience nav ids to app paths. */
function resolveDestinationHref(
  experienceKey: string,
  entryId: string,
): string | null {
  const id = entryId.toLowerCase();
  if (id.includes("walk") || id.includes("today")) return "/today";
  if (id.includes("coverage")) return "/today/coverage";
  if (id.includes("asset") || experienceKey === "ASSETS") return "/assets";
  if (id.includes("work_order") || experienceKey === "WORK_ORDERS") {
    return "/assets";
  }
  if (id.includes("staff") || id.includes("schedule")) return "/today/coverage";
  return null;
}

function adaptExperience(
  experience: ProjectionExperience,
  snapshot: ProjectionSnapshot,
  departmentKey: OcDepartmentSection["departmentKey"],
): OcExperienceContributor {
  const catalog = requireExperience(experience.reference.experienceKey);
  const scope = snapshot.queryScopes.byExperience[experience.id];
  const domains = scope?.domains ?? catalog.contracts.queryScope.domains;
  const readinessSignalKeys =
    catalog.contracts.statusContracts.readinessSignalKeys ?? [];
  const tools = toolEntries(catalog.tools);
  const destinations = destinationHandlesFor(experience);
  const contributionKinds = contributionKindsFromContracts({
    domains,
    tools: catalog.tools,
    readinessSignalKeys,
    hasNavigation: experience.navigation.entries.length > 0,
  });

  return {
    id: experience.id,
    experienceKey: experience.reference.experienceKey,
    label: experience.label,
    order: experience.order,
    areaKey: experience.reference.areaKey,
    departmentKey,
    unitIds: scope?.unitIds ?? [],
    spaceIds: scope?.spaceIds ?? [],
    domains,
    tools,
    actions: actionEntries(experience),
    allowedActionKeys: experience.permissions.allowedActionKeys,
    readinessSignalKeys,
    contributionKinds,
    destinationHandles: destinations,
  };
}

function adaptAreas(
  snapshot: ProjectionSnapshot,
  departmentKey: OcDepartmentSection["departmentKey"],
): OcAreaContributor[] {
  const experiences = [...snapshot.experiences].sort(
    (a, b) =>
      a.order - b.order ||
      a.reference.experienceKey.localeCompare(b.reference.experienceKey),
  );
  const byArea = new Map<string, OcExperienceContributor[]>();
  for (const experience of experiences) {
    const list = byArea.get(experience.reference.areaKey) ?? [];
    list.push(adaptExperience(experience, snapshot, departmentKey));
    byArea.set(experience.reference.areaKey, list);
  }

  return [...snapshot.areas]
    .sort((a, b) => a.order - b.order || a.areaKey.localeCompare(b.areaKey))
    .map((area) => ({
      areaKey: area.areaKey,
      label: area.label,
      order: area.order,
      experiences: (byArea.get(area.areaKey) ?? []).sort(
        (a, b) =>
          a.order - b.order || a.experienceKey.localeCompare(b.experienceKey),
      ),
    }))
    .filter((area) => area.experiences.length > 0);
}

function departmentLabel(key: string): string {
  if (key === "DIETARY") return "Dietary";
  if (key === "EVS") return "EVS";
  if (key === "PLANT") return "Plant";
  return key;
}

function adaptDepartmentSnapshot(
  snapshot: ProjectionSnapshot,
  labeled: boolean,
): OcDepartmentSection | null {
  const lens = snapshot.context.request.lens;
  if (lens.mode !== "DEPARTMENT") return null;

  const collected = collectLocationIds(snapshot.locations.roots);
  const projectedUnitIds = [...collected.unitIds].sort((a, b) =>
    a.localeCompare(b),
  );
  const actionableSorted = [...collected.actionableUnitIds].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    departmentKey: lens.departmentKey,
    label: labeled ? departmentLabel(lens.departmentKey) : null,
    areas: adaptAreas(snapshot, lens.departmentKey),
    plantPolicy: snapshot.plantPolicy ?? null,
    projectedUnitIds,
    actionableUnitIds:
      actionableSorted.length > 0 ? actionableSorted : projectedUnitIds,
  };
}

function buildQueryScopesByDomain(
  snapshot: ProjectionSnapshot,
): OcQueryScopesByDomain {
  const byDomain: Record<string, ProjectionQueryScope[]> = {};
  for (const scope of Object.values(snapshot.queryScopes.byExperience)) {
    for (const domain of scope.domains) {
      const list = byDomain[domain] ?? [];
      list.push(scope);
      byDomain[domain] = list;
    }
  }
  return byDomain;
}

/**
 * Map Experience contribution kinds → existing OC card ids.
 * Empty Areas / unsupported signal groups are already suppressed by adapter filters.
 */
export function resolveEligibleOcCards(
  contributors: readonly OcExperienceContributor[],
  projectedUnitIds: readonly string[],
): OperationsCenterCardId[] {
  if (projectedUnitIds.length === 0 && contributors.length === 0) {
    return [];
  }

  const kinds = new Set<OcContributionKind>();
  for (const c of contributors) {
    for (const k of c.contributionKinds) kinds.add(k);
  }

  const eligible: OperationsCenterCardId[] = [];
  for (const cardId of OPERATIONS_CENTER_CARD_IDS) {
    if (cardId === "unit-exceptions") {
      if (
        kinds.has("readiness") ||
        kinds.has("outstanding_work") ||
        projectedUnitIds.length > 0
      ) {
        eligible.push(cardId);
      }
      continue;
    }
    if (cardId === "open-repairs") {
      if (kinds.has("issues_repairs")) eligible.push(cardId);
      continue;
    }
    if (cardId === "staffing-gaps" || cardId === "call-downs") {
      if (kinds.has("staffing") || kinds.has("operations")) {
        eligible.push(cardId);
      }
      continue;
    }
    if (cardId === "compliance-summary" || cardId === "unit-log-board") {
      if (kinds.has("compliance_logs") || kinds.has("inspections")) {
        eligible.push(cardId);
      }
      continue;
    }
    if (cardId === "meal-boards") {
      if (kinds.has("operations")) eligible.push(cardId);
      continue;
    }
  }
  return eligible;
}

/**
 * Adapt Projection into Operations Center eligibility scope.
 */
export function adaptProjectionToOperationsCenter(
  snapshot: ProjectionSnapshot,
  options?: {
    error?: string | null;
    diagnostics?: readonly ProjectionDiagnostic[];
    projectionDurationMs?: number | null;
  },
): ProjectedOperationsCenterScope {
  const lens = snapshot.context.request.lens;
  const lensMode = lens.mode === "FACILITY" ? "FACILITY" : "DEPARTMENT";
  const lensKey =
    lens.mode === "FACILITY"
      ? "facility"
      : `department:${lens.departmentKey}`;

  let departmentSections: OcDepartmentSection[];
  const allUnitIds = new Set<string>();
  const allSpaceIds = new Set<string>();
  let plantPolicy = snapshot.plantPolicy ?? null;

  if (lens.mode === "FACILITY") {
    const children = snapshot.facilityOverview?.departmentSnapshots ?? [];
    departmentSections = children
      .map((child) => adaptDepartmentSnapshot(child, true))
      .filter(
        (s): s is OcDepartmentSection => s != null && s.areas.length > 0,
      );
    for (const child of children) {
      const collected = collectLocationIds(child.locations.roots);
      collected.unitIds.forEach((id) => allUnitIds.add(id));
      collected.spaceIds.forEach((id) => allSpaceIds.add(id));
      if (child.plantPolicy?.applied) {
        plantPolicy = child.plantPolicy;
      }
    }
  } else {
    const single = adaptDepartmentSnapshot(snapshot, false);
    departmentSections =
      single && single.areas.length > 0 ? [single] : [];
    const collected = collectLocationIds(snapshot.locations.roots);
    collected.unitIds.forEach((id) => allUnitIds.add(id));
    collected.spaceIds.forEach((id) => allSpaceIds.add(id));
  }

  const experienceContributors = departmentSections.flatMap((section) =>
    section.areas.flatMap((area) => area.experiences),
  );
  const projectedUnitIds = [...allUnitIds].sort((a, b) => a.localeCompare(b));
  const projectedSpaceIds = [...allSpaceIds].sort((a, b) => a.localeCompare(b));

  const readinessSignalKeys = [
    ...new Set(
      experienceContributors.flatMap((c) => [...c.readinessSignalKeys]),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const destinationHandles = experienceContributors.flatMap(
    (c) => c.destinationHandles,
  );
  const allowedActions = experienceContributors.flatMap((c) => c.actions);
  const projectedAreaKeys = [
    ...new Set(
      departmentSections.flatMap((s) => s.areas.map((a) => a.areaKey)),
    ),
  ];
  const projectedExperiences = [
    ...new Set(experienceContributors.map((c) => c.experienceKey)),
  ];

  const querySnapshots =
    lens.mode === "FACILITY"
      ? (snapshot.facilityOverview?.departmentSnapshots ?? [])
      : [snapshot];
  const queryScopesByDomainMutable: Record<string, ProjectionQueryScope[]> = {};
  for (const child of querySnapshots) {
    const partial = buildQueryScopesByDomain(child);
    for (const [domain, scopes] of Object.entries(partial)) {
      queryScopesByDomainMutable[domain] = [
        ...(queryScopesByDomainMutable[domain] ?? []),
        ...scopes,
      ];
    }
  }
  const queryScopesByDomain: OcQueryScopesByDomain = queryScopesByDomainMutable;

  const eligibleCardIds = resolveEligibleOcCards(
    experienceContributors,
    projectedUnitIds,
  );

  const diagnostics = [
    ...(options?.diagnostics ?? snapshot.diagnostics.issues ?? []),
  ];

  return {
    facilityId: snapshot.context.identity.facilityId,
    lensMode,
    lensKey,
    departmentKey: lens.mode === "DEPARTMENT" ? lens.departmentKey : null,
    departmentSections,
    projectedUnitIds,
    projectedSpaceIds,
    projectedAreaKeys,
    projectedExperiences,
    experienceContributors,
    readinessSignalKeys,
    queryScopesByDomain,
    allowedActions,
    destinationHandles,
    eligibleCardIds,
    plantPolicy,
    diagnostics,
    performance: {
      projectionDurationMs: options?.projectionDurationMs ?? null,
      dashboardQueryDurationMs: null,
      readinessDurationMs: null,
      compositionDurationMs: null,
      projectedLocationCount: projectedUnitIds.length,
      projectedExperienceCount: projectedExperiences.length,
      domainRowCountsBeforeIntersection: null,
      domainRowCountsAfterIntersection: null,
    },
    error: options?.error ?? null,
  };
}

export function emptyOperationsCenterScope(
  facilityId: string,
  error: string,
  diagnostics: readonly ProjectionDiagnostic[] = [],
): ProjectedOperationsCenterScope {
  return {
    facilityId,
    lensMode: "DEPARTMENT",
    lensKey: "fail-closed",
    departmentKey: null,
    departmentSections: [],
    projectedUnitIds: [],
    projectedSpaceIds: [],
    projectedAreaKeys: [],
    projectedExperiences: [],
    experienceContributors: [],
    readinessSignalKeys: [],
    queryScopesByDomain: {},
    allowedActions: [],
    destinationHandles: [],
    eligibleCardIds: [],
    plantPolicy: null,
    diagnostics: [
      ...diagnostics,
      {
        code: "PROJECTION_INVARIANT",
        severity: "ERROR",
        message: error,
      },
    ],
    performance: {
      projectionDurationMs: null,
      dashboardQueryDurationMs: null,
      readinessDurationMs: null,
      compositionDurationMs: null,
      projectedLocationCount: 0,
      projectedExperienceCount: 0,
      domainRowCountsBeforeIntersection: null,
      domainRowCountsAfterIntersection: null,
    },
    error,
  };
}
