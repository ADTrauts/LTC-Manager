/**
 * Wave 15K — Business Workspace Projection adapter.
 *
 * Pure: ProjectionSnapshot → ProjectedBusinessWorkspaceScope.
 * Consumes ProjectionSnapshot only — no capability / Unit-type / department
 * module list interpretation as eligibility.
 */

import {
  getExperienceTool,
  requireExperience,
  type ExperienceToolKey,
} from "@/lib/experiences";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import type {
  ProjectionDiagnostic,
  ProjectionExperience,
  ProjectionLocationNode,
  ProjectionQueryScope,
  ProjectionSnapshot,
} from "@/lib/projection";

import type {
  BwActionEntry,
  BwAreaContributor,
  BwContributionKind,
  BwDepartmentSection,
  BwDestinationHandle,
  BwManagerSignalContributor,
  BwQueryScopesByDomain,
  BwToolEntry,
  ProjectedBusinessWorkspaceScope,
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

function toolEntries(keys: readonly ExperienceToolKey[]): BwToolEntry[] {
  return keys.map((key) => ({
    key,
    name: getExperienceTool(key)?.name ?? key,
  }));
}

function actionEntries(experience: ProjectionExperience): BwActionEntry[] {
  const allowed = new Set(experience.permissions.allowedActionKeys);
  return experience.actions
    .filter((action) => allowed.has(action.key))
    .map((action) => ({ key: action.key, label: action.label }));
}

/**
 * Derive manager signal contribution kinds from Experience contracts.
 * No department-name branching.
 */
export function contributionKindsFromContracts(input: {
  domains: readonly string[];
  tools: readonly ExperienceToolKey[];
  readinessSignalKeys: readonly string[];
  experienceKey: string;
  hasNavigation: boolean;
}): BwContributionKind[] {
  const kinds = new Set<BwContributionKind>();
  const domains = input.domains.map((d) => d.toLowerCase());
  const tools = new Set(input.tools);
  const key = input.experienceKey.toUpperCase();

  if (input.readinessSignalKeys.length > 0) kinds.add("readiness");
  if (input.hasNavigation) kinds.add("navigation");

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
    )
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
    ) ||
    key === "ASSETS" ||
    key === "WORK_ORDERS" ||
    key === "PREVENTIVE_MAINTENANCE" ||
    key === "EQUIPMENT"
  ) {
    kinds.add("issues_repairs");
    kinds.add("assets");
    kinds.add("outstanding_work");
  }

  if (domainMatches("audit", "inspection")) {
    kinds.add("inspections");
  }

  if (
    domainMatches("staffing", "assignment", "coverage") ||
    key.includes("ASSIGNMENT")
  ) {
    kinds.add("staffing");
    kinds.add("assignments");
  }

  if (tools.has("TASKS")) kinds.add("outstanding_work");

  return [...kinds];
}

function resolveDestinationHref(
  experienceKey: string,
  entryId: string,
): { href: string | null; compatibility: boolean } {
  const id = entryId.toLowerCase();
  if (id.includes("walk") || id.includes("today")) {
    return { href: "/today", compatibility: true };
  }
  if (id.includes("coverage") || id.includes("staff")) {
    return { href: "/today/coverage", compatibility: true };
  }
  if (
    id.includes("asset") ||
    experienceKey === "ASSETS" ||
    experienceKey === "WORK_ORDERS" ||
    experienceKey === "PREVENTIVE_MAINTENANCE"
  ) {
    return { href: "/assets", compatibility: true };
  }
  if (id.includes("log") || experienceKey === "TEMPERATURE_MONITORING") {
    return { href: "/logs", compatibility: true };
  }
  if (id.includes("inspect")) {
    return { href: "/admin/inspections", compatibility: true };
  }
  if (id.includes("issue") || id.includes("repair")) {
    return { href: "/issues", compatibility: true };
  }
  return { href: null, compatibility: false };
}

function destinationHandlesFor(
  experience: ProjectionExperience,
): BwDestinationHandle[] {
  return experience.navigation.entries.map((entry) => {
    const resolved = resolveDestinationHref(
      experience.reference.experienceKey,
      entry.id,
    );
    return {
      id: entry.id,
      label: entry.label,
      href: resolved.href,
      experienceKey: experience.reference.experienceKey,
      compatibility: resolved.compatibility,
    };
  });
}

function adaptExperience(
  experience: ProjectionExperience,
  snapshot: ProjectionSnapshot,
  departmentKey: BwDepartmentSection["departmentKey"],
): BwManagerSignalContributor {
  const catalog = requireExperience(experience.reference.experienceKey);
  const scope = snapshot.queryScopes.byExperience[experience.id];
  const domains = scope?.domains ?? catalog.contracts.queryScope.domains;
  const readinessSignalKeys =
    catalog.contracts.statusContracts.readinessSignalKeys ?? [];
  const contributionKinds = contributionKindsFromContracts({
    domains,
    tools: catalog.tools,
    readinessSignalKeys,
    experienceKey: experience.reference.experienceKey,
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
    tools: toolEntries(catalog.tools),
    actions: actionEntries(experience),
    allowedActionKeys: experience.permissions.allowedActionKeys,
    readinessSignalKeys,
    contributionKinds,
    destinationHandles: destinationHandlesFor(experience),
  };
}

function adaptAreas(
  snapshot: ProjectionSnapshot,
  departmentKey: BwDepartmentSection["departmentKey"],
): BwAreaContributor[] {
  const experiences = [...snapshot.experiences].sort(
    (a, b) =>
      a.order - b.order ||
      a.reference.experienceKey.localeCompare(b.reference.experienceKey),
  );
  const byArea = new Map<string, BwManagerSignalContributor[]>();
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
): BwDepartmentSection | null {
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
): BwQueryScopesByDomain {
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
 * Quick actions from projected contribution kinds + Experience keys.
 * Shared home links always allowed when entitled at the page layer.
 */
export function resolveAllowedQuickActionIds(
  contributors: readonly BwManagerSignalContributor[],
): string[] {
  const kinds = new Set<BwContributionKind>();
  const keys = new Set<string>();
  for (const c of contributors) {
    keys.add(c.experienceKey);
    for (const k of c.contributionKinds) kinds.add(k);
  }

  const ids = new Set<string>([
    "operations-center",
    "todays-work",
    "knowledge",
  ]);

  if (kinds.has("issues_repairs")) ids.add("report-issue");
  if (kinds.has("inspections")) ids.add("new-inspection");
  if (kinds.has("compliance_logs")) ids.add("logs");
  if (
    kinds.has("assets") ||
    keys.has("ASSETS") ||
    keys.has("WORK_ORDERS") ||
    keys.has("PREVENTIVE_MAINTENANCE")
  ) {
    ids.add("assets");
  }
  if (
    (kinds.has("staffing") || kinds.has("assignments")) &&
    isOperationalAssignmentsEnabled()
  ) {
    ids.add("assignment-board");
  }

  return [...ids];
}

/**
 * Adapt Projection into Business Workspace eligibility scope.
 */
export function adaptProjectionToBusinessWorkspace(
  snapshot: ProjectionSnapshot,
  options?: {
    error?: string | null;
    diagnostics?: readonly ProjectionDiagnostic[];
    projectionDurationMs?: number | null;
  },
): ProjectedBusinessWorkspaceScope {
  const lens = snapshot.context.request.lens;
  const lensMode = lens.mode === "FACILITY" ? "FACILITY" : "DEPARTMENT";
  const lensKey =
    lens.mode === "FACILITY"
      ? "facility"
      : `department:${lens.departmentKey}`;

  let departmentSections: BwDepartmentSection[];
  const allUnitIds = new Set<string>();
  const allSpaceIds = new Set<string>();
  let plantPolicy = snapshot.plantPolicy ?? null;

  if (lens.mode === "FACILITY") {
    const children = snapshot.facilityOverview?.departmentSnapshots ?? [];
    departmentSections = children
      .map((child) => adaptDepartmentSnapshot(child, true))
      .filter(
        (s): s is BwDepartmentSection => s != null && s.areas.length > 0,
      );
    for (const child of children) {
      const collected = collectLocationIds(child.locations.roots);
      collected.unitIds.forEach((id) => allUnitIds.add(id));
      collected.spaceIds.forEach((id) => allSpaceIds.add(id));
      if (child.plantPolicy?.applied) plantPolicy = child.plantPolicy;
    }
  } else {
    const single = adaptDepartmentSnapshot(snapshot, false);
    departmentSections =
      single && single.areas.length > 0 ? [single] : [];
    const collected = collectLocationIds(snapshot.locations.roots);
    collected.unitIds.forEach((id) => allUnitIds.add(id));
    collected.spaceIds.forEach((id) => allSpaceIds.add(id));
  }

  const managerSignalContributors = departmentSections.flatMap((section) =>
    section.areas.flatMap((area) => area.experiences),
  );
  const projectedUnitIds = [...allUnitIds].sort((a, b) => a.localeCompare(b));
  const projectedSpaceIds = [...allSpaceIds].sort((a, b) =>
    a.localeCompare(b),
  );

  const readinessSignalKeys = [
    ...new Set(
      managerSignalContributors.flatMap((c) => [...c.readinessSignalKeys]),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const destinationHandles = managerSignalContributors.flatMap(
    (c) => c.destinationHandles,
  );
  const projectedAreaKeys = [
    ...new Set(
      departmentSections.flatMap((s) => s.areas.map((a) => a.areaKey)),
    ),
  ];
  const projectedExperienceKeys = [
    ...new Set(managerSignalContributors.map((c) => c.experienceKey)),
  ];

  const querySnapshots =
    lens.mode === "FACILITY"
      ? (snapshot.facilityOverview?.departmentSnapshots ?? [])
      : [snapshot];
  const queryScopesByDomainMutable: Record<string, ProjectionQueryScope[]> =
    {};
  for (const child of querySnapshots) {
    const partial = buildQueryScopesByDomain(child);
    for (const [domain, scopes] of Object.entries(partial)) {
      queryScopesByDomainMutable[domain] = [
        ...(queryScopesByDomainMutable[domain] ?? []),
        ...scopes,
      ];
    }
  }

  const kinds = new Set(
    managerSignalContributors.flatMap((c) => c.contributionKinds),
  );
  const allowedQuickActionIds = resolveAllowedQuickActionIds(
    managerSignalContributors,
  );

  return {
    facilityId: snapshot.context.identity.facilityId,
    lensMode,
    lensKey,
    departmentKey: lens.mode === "DEPARTMENT" ? lens.departmentKey : null,
    departmentSections,
    projectedUnitIds,
    projectedSpaceIds,
    projectedAreaKeys,
    projectedExperienceKeys,
    managerSignalContributors,
    queryScopesByDomain: queryScopesByDomainMutable,
    readinessSignalKeys,
    allowedQuickActionIds,
    destinationHandles,
    showLogCompletion: kinds.has("compliance_logs"),
    showMealContext: kinds.has("operations"),
    plantPolicy,
    diagnostics: [
      ...(options?.diagnostics ?? snapshot.diagnostics.issues ?? []),
    ],
    performance: {
      projectionDurationMs: options?.projectionDurationMs ?? null,
      liveInputDurationMs: null,
      compositionDurationMs: null,
      projectedLocationCount: projectedUnitIds.length,
      projectedExperienceCount: projectedExperienceKeys.length,
      domainRowCountsBeforeIntersection: null,
      domainRowCountsAfterIntersection: null,
    },
    error: options?.error ?? null,
  };
}

export function emptyBusinessWorkspaceScope(
  facilityId: string,
  error: string,
  diagnostics: readonly ProjectionDiagnostic[] = [],
): ProjectedBusinessWorkspaceScope {
  return {
    facilityId,
    lensMode: "DEPARTMENT",
    lensKey: "fail-closed",
    departmentKey: null,
    departmentSections: [],
    projectedUnitIds: [],
    projectedSpaceIds: [],
    projectedAreaKeys: [],
    projectedExperienceKeys: [],
    managerSignalContributors: [],
    queryScopesByDomain: {},
    readinessSignalKeys: [],
    allowedQuickActionIds: [],
    destinationHandles: [],
    showLogCompletion: false,
    showMealContext: false,
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
      liveInputDurationMs: null,
      compositionDurationMs: null,
      projectedLocationCount: 0,
      projectedExperienceCount: 0,
      domainRowCountsBeforeIntersection: null,
      domainRowCountsAfterIntersection: null,
    },
    error,
  };
}
