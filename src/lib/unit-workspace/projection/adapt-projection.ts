/**
 * Wave 15H — Unit Workspace Projection adapter.
 *
 * Pure: ProjectionSnapshot + unitId → UnitWorkspaceProjectionView.
 * Does not interpret departments, Plant, or capabilities.
 */

import type { FacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import { DEFAULT_FACILITY_VOCABULARY } from "@/lib/facility-builder/facility-vocabulary";
import {
  getExperienceTool,
  requireExperience,
  type ExperienceToolKey,
} from "@/lib/experiences";
import type {
  ProjectionArea,
  ProjectionExperience,
  ProjectionLocationNode,
  ProjectionSnapshot,
} from "@/lib/projection";

import type {
  UnitWorkspaceActionEntry,
  UnitWorkspaceAreaPanel,
  UnitWorkspaceExperiencePanel,
  UnitWorkspaceProjectionSection,
  UnitWorkspaceProjectionView,
  UnitWorkspaceRoomContext,
  UnitWorkspaceToolEntry,
} from "./types";

function collectUnitLocationIds(
  roots: readonly ProjectionLocationNode[],
  unitId: string,
): { locationIds: Set<string>; rooms: UnitWorkspaceRoomContext[] } {
  const locationIds = new Set<string>();
  const rooms: UnitWorkspaceRoomContext[] = [];

  const visit = (node: ProjectionLocationNode) => {
    const ref = node.reference;
    if (ref.kind === "UNIT" && ref.unitId === unitId) {
      locationIds.add(node.id);
    }
    if (ref.kind === "SPACE" && ref.unitId === unitId) {
      locationIds.add(node.id);
      rooms.push({
        locationId: node.id,
        spaceId: ref.spaceId,
        label: node.label,
        presentation: node.presentation,
      });
    }
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return { locationIds, rooms };
}

function experienceAppliesToUnit(
  experience: ProjectionExperience,
  locationIds: Set<string>,
  unitId: string,
  scope: ProjectionSnapshot["queryScopes"],
): boolean {
  if (experience.reference.locationIds.some((id) => locationIds.has(id))) {
    return true;
  }
  const queryScope = scope.byExperience[experience.id];
  if (queryScope?.unitIds.includes(unitId)) return true;
  return false;
}

function toolEntries(keys: readonly ExperienceToolKey[]): UnitWorkspaceToolEntry[] {
  return keys.map((key) => {
    const tool = getExperienceTool(key);
    return {
      key,
      name: tool?.name ?? key,
      description: tool?.description ?? "",
    };
  });
}

function actionEntries(
  experience: ProjectionExperience,
): UnitWorkspaceActionEntry[] {
  const allowed = new Set(experience.permissions.allowedActionKeys);
  return experience.actions
    .filter((action) => allowed.has(action.key))
    .map((action) => ({
      key: action.key,
      label: action.label,
      category: action.category,
      placement: action.placement,
    }));
}

function adaptExperience(
  experience: ProjectionExperience,
  areaKey: string,
): UnitWorkspaceExperiencePanel {
  const catalog = requireExperience(experience.reference.experienceKey);
  const density =
    experience.workspace.unitWorkspace.density ??
    experience.workspace.default.density ??
    "FULL";
  return {
    id: experience.id,
    experienceKey: experience.reference.experienceKey,
    label: experience.label,
    description: catalog.description,
    order: experience.order,
    areaKey,
    tools: toolEntries(catalog.tools),
    actions: actionEntries(experience),
    allowedActionKeys: experience.permissions.allowedActionKeys,
    statusKeys: experience.contracts.contracts.statusContracts?.statusKeys ?? [],
    density,
    locationIds: experience.reference.locationIds,
  };
}

function adaptAreasForUnit(
  snapshot: ProjectionSnapshot,
  unitId: string,
): {
  areas: UnitWorkspaceAreaPanel[];
  rooms: UnitWorkspaceRoomContext[];
  unitIncluded: boolean;
} {
  const { locationIds, rooms } = collectUnitLocationIds(
    snapshot.locations.roots,
    unitId,
  );
  const unitIncluded = locationIds.size > 0;

  const experiences = snapshot.experiences
    .filter((experience) =>
      experienceAppliesToUnit(
        experience,
        locationIds,
        unitId,
        snapshot.queryScopes,
      ),
    )
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.reference.experienceKey.localeCompare(b.reference.experienceKey),
    );

  const byArea = new Map<string, UnitWorkspaceExperiencePanel[]>();
  for (const experience of experiences) {
    const areaKey = experience.reference.areaKey;
    const list = byArea.get(areaKey) ?? [];
    list.push(adaptExperience(experience, areaKey));
    byArea.set(areaKey, list);
  }

  const areas: UnitWorkspaceAreaPanel[] = [...snapshot.areas]
    .sort((a, b) => a.order - b.order || a.areaKey.localeCompare(b.areaKey))
    .map((area: ProjectionArea) => {
      const areaExperiences = (byArea.get(area.areaKey) ?? []).sort(
        (a, b) =>
          a.order - b.order || a.experienceKey.localeCompare(b.experienceKey),
      );
      return {
        areaKey: area.areaKey,
        label: area.label,
        order: area.order,
        experiences: areaExperiences,
      };
    })
    .filter((area) => area.experiences.length > 0);

  return { areas, rooms, unitIncluded };
}

function adaptDepartmentSnapshot(
  snapshot: ProjectionSnapshot,
  unitId: string,
  labeled: boolean,
): UnitWorkspaceProjectionSection | null {
  const lens = snapshot.context.request.lens;
  if (lens.mode !== "DEPARTMENT") return null;
  const { areas, unitIncluded } = adaptAreasForUnit(snapshot, unitId);
  if (!unitIncluded && areas.length === 0) return null;
  return {
    departmentKey: lens.departmentKey,
    label: labeled
      ? lens.departmentKey === "DIETARY"
        ? "Dietary"
        : lens.departmentKey === "EVS"
          ? "EVS"
          : "Plant"
      : null,
    areas,
    plantPolicy: snapshot.plantPolicy ?? null,
  };
}

/**
 * Adapt Projection into Unit Workspace Area → Experience panels for one Unit.
 */
export function adaptProjectionToUnitWorkspace(
  snapshot: ProjectionSnapshot,
  unitId: string,
  vocabulary: FacilityVocabulary = DEFAULT_FACILITY_VOCABULARY,
  error: string | null = null,
): UnitWorkspaceProjectionView {
  const lens = snapshot.context.request.lens;
  const lensMode = lens.mode === "FACILITY" ? "FACILITY" : "DEPARTMENT";
  const lensKey =
    lens.mode === "FACILITY"
      ? "facility"
      : `department:${lens.departmentKey}`;

  let sections: UnitWorkspaceProjectionSection[];
  let roomContext: UnitWorkspaceRoomContext[] = [];
  let unitIncluded = false;

  if (lens.mode === "FACILITY") {
    const children = snapshot.facilityOverview?.departmentSnapshots ?? [];
    sections = children
      .map((child) => adaptDepartmentSnapshot(child, unitId, true))
      .filter((s): s is UnitWorkspaceProjectionSection => s != null);
    for (const child of children) {
      const collected = collectUnitLocationIds(child.locations.roots, unitId);
      if (collected.locationIds.size > 0) unitIncluded = true;
      for (const room of collected.rooms) {
        if (!roomContext.some((r) => r.spaceId === room.spaceId)) {
          roomContext.push(room);
        }
      }
    }
  } else {
    const single = adaptDepartmentSnapshot(snapshot, unitId, false);
    sections = single ? [single] : [];
    const collected = collectUnitLocationIds(snapshot.locations.roots, unitId);
    unitIncluded = collected.locationIds.size > 0;
    roomContext = collected.rooms;
  }

  return {
    facilityId: snapshot.context.identity.facilityId,
    unitId,
    unitIncluded,
    lensMode,
    lensKey,
    sections,
    roomContext,
    level1Label: vocabulary.level1.singular,
    level2Label: vocabulary.level2.singular,
    level3Label: vocabulary.level3.singular,
    error,
  };
}
