/**
 * Wave 15I — Today's Work Projection adapter.
 *
 * Pure: ProjectionSnapshot → TodaysWorkProjectionView.
 * Does not rank work, compute readiness, or invent locations.
 */

import {
  getExperienceTool,
  requireExperience,
  type ExperienceToolKey,
} from "@/lib/experiences";
import type {
  ProjectionExperience,
  ProjectionLocationNode,
  ProjectionSnapshot,
} from "@/lib/projection";

import type {
  TodaysWorkActionEntry,
  TodaysWorkAreaContributor,
  TodaysWorkExperienceContributor,
  TodaysWorkProjectionSection,
  TodaysWorkProjectionView,
  TodaysWorkToolEntry,
} from "./types";

function collectUnitIdsFromTree(roots: readonly ProjectionLocationNode[]): {
  allUnitIds: Set<string>;
  actionableUnitIds: Set<string>;
} {
  const allUnitIds = new Set<string>();
  const actionableUnitIds = new Set<string>();

  const visit = (node: ProjectionLocationNode) => {
    const ref = node.reference;
    if (ref.kind === "UNIT") {
      allUnitIds.add(ref.unitId);
      if (node.presentation === "ACTIONABLE") {
        actionableUnitIds.add(ref.unitId);
      }
    }
    if (ref.kind === "SPACE") {
      allUnitIds.add(ref.unitId);
      if (node.presentation === "ACTIONABLE") {
        actionableUnitIds.add(ref.unitId);
      }
    }
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return { allUnitIds, actionableUnitIds };
}

function toolEntries(keys: readonly ExperienceToolKey[]): TodaysWorkToolEntry[] {
  return keys.map((key) => ({
    key,
    name: getExperienceTool(key)?.name ?? key,
  }));
}

function actionEntries(
  experience: ProjectionExperience,
): TodaysWorkActionEntry[] {
  const allowed = new Set(experience.permissions.allowedActionKeys);
  return experience.actions
    .filter((action) => allowed.has(action.key))
    .map((action) => ({ key: action.key, label: action.label }));
}

function adaptExperience(
  experience: ProjectionExperience,
  snapshot: ProjectionSnapshot,
): TodaysWorkExperienceContributor {
  const catalog = requireExperience(experience.reference.experienceKey);
  const scope = snapshot.queryScopes.byExperience[experience.id];
  return {
    id: experience.id,
    experienceKey: experience.reference.experienceKey,
    label: experience.label,
    description: catalog.description,
    order: experience.order,
    areaKey: experience.reference.areaKey,
    unitIds: scope?.unitIds ?? [],
    spaceIds: scope?.spaceIds ?? [],
    domains: scope?.domains ?? catalog.contracts.queryScope.domains,
    tools: toolEntries(catalog.tools),
    actions: actionEntries(experience),
    allowedActionKeys: experience.permissions.allowedActionKeys,
  };
}

function adaptAreas(
  snapshot: ProjectionSnapshot,
): TodaysWorkAreaContributor[] {
  const experiences = [...snapshot.experiences].sort(
    (a, b) =>
      a.order - b.order ||
      a.reference.experienceKey.localeCompare(b.reference.experienceKey),
  );
  const byArea = new Map<string, TodaysWorkExperienceContributor[]>();
  for (const experience of experiences) {
    const list = byArea.get(experience.reference.areaKey) ?? [];
    list.push(adaptExperience(experience, snapshot));
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
): TodaysWorkProjectionSection | null {
  const lens = snapshot.context.request.lens;
  if (lens.mode !== "DEPARTMENT") return null;
  return {
    departmentKey: lens.departmentKey,
    label: labeled ? departmentLabel(lens.departmentKey) : null,
    areas: adaptAreas(snapshot),
    plantPolicy: snapshot.plantPolicy ?? null,
  };
}

/**
 * Adapt Projection into Today's Work eligibility + Experience contributors.
 */
export function adaptProjectionToTodaysWork(
  snapshot: ProjectionSnapshot,
  error: string | null = null,
): TodaysWorkProjectionView {
  const lens = snapshot.context.request.lens;
  const lensMode = lens.mode === "FACILITY" ? "FACILITY" : "DEPARTMENT";
  const lensKey =
    lens.mode === "FACILITY"
      ? "facility"
      : `department:${lens.departmentKey}`;

  let sections: TodaysWorkProjectionSection[];
  const allUnitIds = new Set<string>();
  const actionableUnitIds = new Set<string>();

  if (lens.mode === "FACILITY") {
    const children = snapshot.facilityOverview?.departmentSnapshots ?? [];
    sections = children
      .map((child) => adaptDepartmentSnapshot(child, true))
      .filter(
        (s): s is TodaysWorkProjectionSection =>
          s != null && s.areas.length > 0,
      );
    for (const child of children) {
      const collected = collectUnitIdsFromTree(child.locations.roots);
      collected.allUnitIds.forEach((id) => allUnitIds.add(id));
      collected.actionableUnitIds.forEach((id) => actionableUnitIds.add(id));
    }
  } else {
    const single = adaptDepartmentSnapshot(snapshot, false);
    sections = single && single.areas.length > 0 ? [single] : [];
    const collected = collectUnitIdsFromTree(snapshot.locations.roots);
    collected.allUnitIds.forEach((id) => allUnitIds.add(id));
    collected.actionableUnitIds.forEach((id) => actionableUnitIds.add(id));
  }

  // Prefer actionable Units for ranking pools; fall back to all projected Units.
  const projectedUnitIds = [...allUnitIds].sort((a, b) => a.localeCompare(b));
  const actionableSorted = [...actionableUnitIds].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    facilityId: snapshot.context.identity.facilityId,
    lensMode,
    lensKey,
    projectedUnitIds,
    actionableUnitIds:
      actionableSorted.length > 0 ? actionableSorted : projectedUnitIds,
    sections,
    error,
  };
}
