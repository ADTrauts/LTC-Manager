/**
 * Department Operational Profile — pure domain snapshot types.
 *
 * Wave 14B. These types decouple domain logic (baseline, certification,
 * resolution, lifecycle) from Prisma so the rules are pure and testable.
 * The persisted rows in prisma/schema.prisma mirror these shapes.
 */

export type OperationalProfileStatusKey =
  | "DRAFT"
  | "CERTIFIED"
  | "ACTIVE"
  | "RETIRED";

export type RoomExceptionMode = "ENABLE" | "DISABLE" | "OVERRIDE";

/** Bounded Experience tuning — validated by validateExperienceConfiguration. */
export type ExperienceConfiguration = Record<
  string,
  string | number | boolean | readonly string[] | readonly number[]
>;

export type ProfileAreaExperienceSnapshot = {
  id: string;
  /** Wave 14A Experience Registry key. */
  experienceKey: string;
  sortOrder: number;
  isActive: boolean;
  configuration: ExperienceConfiguration | null;
};

export type ProfileAreaSnapshot = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  experiences: ProfileAreaExperienceSnapshot[];
};

export type ArchetypeExperienceSnapshot = {
  id: string;
  /** References ProfileAreaExperienceSnapshot.id within the same profile. */
  areaExperienceId: string;
  isActive: boolean;
  sortOrder: number;
  configuration: ExperienceConfiguration | null;
};

export type ProfileArchetypeSnapshot = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  experiences: ArchetypeExperienceSnapshot[];
};

export type ProfileSnapshot = {
  id: string;
  facilityId: string;
  departmentId: string;
  /** Operational department key (DIETARY | EVS | PLANT | custom). */
  departmentKey: string;
  name: string;
  version: number;
  status: OperationalProfileStatusKey;
  baselineKey: string | null;
  areas: ProfileAreaSnapshot[];
  archetypes: ProfileArchetypeSnapshot[];
};

export type RoomArchetypeBindingSnapshot = {
  id: string;
  unitSpaceId: string;
  archetypeId: string;
};

export type RoomExceptionSnapshot = {
  id: string;
  unitSpaceId: string;
  areaExperienceId: string;
  mode: RoomExceptionMode;
  configuration: ExperienceConfiguration | null;
  reason: string | null;
};

/**
 * Physical room context provided by Facility Builder loaders.
 * Domain logic never queries rooms itself; callers supply this context.
 */
export type RoomContext = {
  id: string;
  facilityId: string;
  isActive: boolean;
  /** null = builder-only Undesignated staging. */
  unitId: string | null;
  /** Parent unit hierarchy role; STAGED = builder-only staging. */
  parentHierarchyRole: "FLOOR" | "NEIGHBORHOOD" | "LEGACY_LOCATION" | "STAGED" | null;
  /** Department IDs explicitly assigned via UnitSpaceResponsibility. */
  assignedDepartmentIds: readonly string[];
};

/** True when a room is builder-only staged/undesignated (never operational). */
export function isRoomStagedOrUndesignated(room: RoomContext): boolean {
  return room.unitId === null || room.parentHierarchyRole === "STAGED";
}
