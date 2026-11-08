/**
 * In-memory fixtures for Department Operational Profile domain tests.
 * Builds ProfileSnapshot structures from the baseline plans (no database).
 */

import { materializeBaselineProfilePlan } from "./baseline";
import type {
  ProfileSnapshot,
  RoomContext,
  OperationalProfileStatusKey,
} from "./profile-types";

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export const FACILITY_ID = "facility_1";
export const OTHER_FACILITY_ID = "facility_2";

/** Materialize a baseline plan into a full in-memory ProfileSnapshot. */
export function buildBaselineSnapshot(
  departmentKey: "DIETARY" | "EVS" | "PLANT",
  options?: {
    facilityId?: string;
    departmentId?: string;
    status?: OperationalProfileStatusKey;
    version?: number;
  },
): ProfileSnapshot {
  const plan = materializeBaselineProfilePlan(departmentKey);
  const areaExperienceIdByKey = new Map<string, string>();

  const areas = plan.areas.map((areaPlan) => {
    const experiences = areaPlan.experienceKeys.map((experienceKey, index) => {
      const id = nextId("ax");
      areaExperienceIdByKey.set(experienceKey, id);
      return {
        id,
        experienceKey,
        sortOrder: (index + 1) * 10,
        isActive: true,
        configuration: null,
      };
    });
    return {
      id: nextId("area"),
      key: areaPlan.key,
      name: areaPlan.name,
      description: areaPlan.description,
      sortOrder: areaPlan.sortOrder,
      isActive: true,
      experiences,
    };
  });

  const archetypes = plan.archetypes.map((archetypePlan) => ({
    id: nextId("arch"),
    key: archetypePlan.key,
    name: archetypePlan.name,
    description: archetypePlan.description,
    isActive: true,
    sortOrder: archetypePlan.sortOrder,
    experiences: archetypePlan.experienceKeys.map((experienceKey, index) => ({
      id: nextId("archx"),
      areaExperienceId: areaExperienceIdByKey.get(experienceKey)!,
      isActive: true,
      sortOrder: (index + 1) * 10,
      configuration: null,
    })),
  }));

  return {
    id: nextId("profile"),
    facilityId: options?.facilityId ?? FACILITY_ID,
    departmentId: options?.departmentId ?? `dept_${departmentKey.toLowerCase()}`,
    departmentKey,
    name: plan.name,
    version: options?.version ?? 1,
    status: options?.status ?? "DRAFT",
    baselineKey: plan.baselineKey,
    areas,
    archetypes,
  };
}

/** Find the areaExperience id for a registry Experience key in a snapshot. */
export function areaExperienceId(
  profile: ProfileSnapshot,
  experienceKey: string,
): string {
  for (const area of profile.areas) {
    const found = area.experiences.find(
      (experience) => experience.experienceKey === experienceKey,
    );
    if (found) return found.id;
  }
  throw new Error(`Experience ${experienceKey} not in profile fixture`);
}

/** Find an archetype by key. */
export function archetypeByKey(profile: ProfileSnapshot, key: string) {
  const archetype = profile.archetypes.find((a) => a.key === key);
  if (!archetype) throw new Error(`Archetype ${key} not in profile fixture`);
  return archetype;
}

export function buildRoom(overrides?: Partial<RoomContext>): RoomContext {
  return {
    id: nextId("room"),
    facilityId: FACILITY_ID,
    isActive: true,
    unitId: "unit_1",
    parentHierarchyRole: "NEIGHBORHOOD",
    assignedDepartmentIds: [],
    ...overrides,
  };
}
