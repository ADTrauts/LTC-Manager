/**
 * Department Builder Room Types — projection of Facility Builder Room Types
 * among rooms assigned to the selected department.
 *
 * Catalog ownership: Facility Builder presets / customTypeLabel.
 * DepartmentRoomArchetype is internal configuration looked up by preset key,
 * not a second user-facing type catalog.
 */

import { recommendArchetypeKey } from "./archetype-recommendation";
import type { DepartmentActionableLocation } from "./department-locations";
import type {
  ProfileArchetypeSnapshot,
  ProfileSnapshot,
} from "./profile-types";
import { getExperience } from "@/lib/experiences";
import {
  SPACE_TYPE_PRESETS,
  sharedRoomTypeDescription,
} from "@/lib/facility-builder/space-type-presets";

export type DepartmentRoomTypeGroup = {
  roomTypeKey: string;
  label: string;
  isCustom: boolean;
  rooms: DepartmentActionableLocation[];
};

export type RoomTypeExperienceRow = {
  areaExperienceId: string;
  experienceKey: string;
  name: string;
  areaKey: string;
  areaName: string;
  areaSortOrder: number;
  experienceSortOrder: number;
  included: boolean;
  /** Catalog hint — does not imply Runtime consumption. */
  classification: "applicability";
};

export type RoomTypeExperienceGroup = {
  areaKey: string;
  areaName: string;
  sortOrder: number;
  experiences: RoomTypeExperienceRow[];
};

const PRESET_ORDER = new Map(
  SPACE_TYPE_PRESETS.filter((p) => p.key !== "custom").map((p, index) => [p.key, index]),
);

export function groupAssignedRoomsByRoomType(
  locations: readonly DepartmentActionableLocation[],
): DepartmentRoomTypeGroup[] {
  const rooms = locations.filter((l) => l.kind === "room");
  const byKey = new Map<string, DepartmentRoomTypeGroup>();

  for (const room of rooms) {
    const key = room.roomTypeKey ?? "__unknown__";
    const label = room.roomTypeLabel ?? "Room";
    const existing = byKey.get(key);
    if (existing) {
      existing.rooms.push(room);
      continue;
    }
    byKey.set(key, {
      roomTypeKey: key,
      label,
      isCustom: key.startsWith("custom:"),
      rooms: [room],
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const ao = PRESET_ORDER.get(a.roomTypeKey);
    const bo = PRESET_ORDER.get(b.roomTypeKey);
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return a.label.localeCompare(b.label);
  });
}

export function departmentArchetypeForRoomType(input: {
  departmentKey: string;
  roomTypeKey: string;
  profile: ProfileSnapshot | null;
}): ProfileArchetypeSnapshot | null {
  if (!input.profile) return null;
  const presetKey = input.roomTypeKey.startsWith("custom:")
    ? null
    : input.roomTypeKey;
  const recommended = presetKey
    ? recommendArchetypeKey(input.departmentKey, presetKey)
    : undefined;
  const byRecommended = recommended
    ? input.profile.archetypes.find((a) => a.key === recommended && a.isActive)
    : undefined;
  if (byRecommended) return byRecommended;
  if (presetKey) {
    return (
      input.profile.archetypes.find((a) => a.key === presetKey && a.isActive) ??
      null
    );
  }
  return null;
}

export { sharedRoomTypeDescription };

export function customizedAssociatedRoomCount(
  rooms: readonly DepartmentActionableLocation[],
): number {
  return rooms.filter((room) => room.hasOverrides).length;
}

/**
 * Build the Room Type configuration surface from profile Areas + archetype membership.
 * Canonical editable state today is Included / Not used (archetype experience selection).
 */
export function buildRoomTypeExperienceGroups(input: {
  profile: ProfileSnapshot;
  archetype: ProfileArchetypeSnapshot | null;
}): RoomTypeExperienceGroup[] {
  const included = new Set(
    (input.archetype?.experiences ?? [])
      .filter((row) => row.isActive)
      .map((row) => row.areaExperienceId),
  );

  const byArea = new Map<string, RoomTypeExperienceGroup>();
  for (const area of input.profile.areas.filter((a) => a.isActive)) {
    for (const experience of area.experiences.filter((e) => e.isActive)) {
      const definition = getExperience(experience.experienceKey);
      const group =
        byArea.get(area.key) ??
        (() => {
          const created: RoomTypeExperienceGroup = {
            areaKey: area.key,
            areaName: area.name,
            sortOrder: area.sortOrder,
            experiences: [],
          };
          byArea.set(area.key, created);
          return created;
        })();
      group.experiences.push({
        areaExperienceId: experience.id,
        experienceKey: experience.experienceKey,
        name: definition?.name ?? experience.experienceKey,
        areaKey: area.key,
        areaName: area.name,
        areaSortOrder: area.sortOrder,
        experienceSortOrder: experience.sortOrder,
        included: included.has(experience.id),
        classification: "applicability",
      });
    }
  }

  return [...byArea.values()]
    .map((group) => ({
      ...group,
      experiences: [...group.experiences].sort(
        (a, b) => a.experienceSortOrder - b.experienceSortOrder || a.name.localeCompare(b.name),
      ),
    }))
    .filter((group) => group.experiences.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.areaName.localeCompare(b.areaName));
}

export function roomTypeSupportsDepartmentConfiguration(roomTypeKey: string): boolean {
  return !roomTypeKey.startsWith("custom:") && roomTypeKey !== "__unknown__";
}

/**
 * Product ownership classification for Experience Registry keys on Room Type Detail.
 * Used for audits / tests — not rendered as primary administrator UI.
 */
export type RoomTypeExperienceProductClass =
  | "ACTIONABLE_NOW"
  | "APPLICABILITY_ONLY"
  | "REFERENCE_LINK_TO_OWNER"
  | "FUTURE"
  | "LEGACY_REMOVE_FROM_PRIMARY_UI";

export function classifyRoomTypeExperienceForUi(
  experienceKey: string,
): RoomTypeExperienceProductClass {
  switch (experienceKey) {
    case "MEAL_SERVICE":
    case "MEAL_TIMES":
    case "TRAY_ACCURACY":
    case "TEMPERATURE_MONITORING":
    case "SANITATION":
    case "EQUIPMENT":
    case "CLEANING_LISTS":
      // Profile membership exists; no Room Type–scoped entity editor or Run projection yet.
      return "APPLICABILITY_ONLY";
    case "HACCP":
    case "CORRECTIVE_ACTIONS":
    case "ASSETS":
    case "ASSIGNMENTS":
    case "SCHEDULING":
    case "COMPETENCIES":
    case "FORECASTING":
    case "BATCH_RECORDS":
    case "ROUNDING":
    case "SATISFACTION":
    case "AUDITS":
    case "INSPECTIONS":
      return "LEGACY_REMOVE_FROM_PRIMARY_UI";
    default:
      return "LEGACY_REMOVE_FROM_PRIMARY_UI";
  }
}
