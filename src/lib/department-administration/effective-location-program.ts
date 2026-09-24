/**
 * Effective Location Program — composition.
 *
 * Pure / read-oriented. Does not persist or publish.
 * Operational Type remains DepartmentRoomArchetype.
 * Phase 2: Operational Cycles may inherit from Operational Type.
 * Phase 3: Canonical logs may inherit from Operational Type.
 * Phase 4: Configured Teams may inherit from Operational Type.
 * Phase 5B: Coverage Expectations may inherit from Operational Type + Cycle.
 * Work plans and assets still apply only through their own Builders.
 *
 * Grain today: UnitSpace (kind: "SPACE"). kind: "UNIT" is reserved so future
 * neighborhood programming can use the same resolver without a rewrite.
 */

import { getExperience } from "@/lib/experiences";
import {
  resolveDepartmentRoomProfile,
  type ResolvedExperienceSource,
  type ResolvedRoomProfile,
} from "@/lib/department-administration/resolve-room-profile";
import type {
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionSnapshot,
} from "@/lib/department-administration/profile-types";

export type EffectiveLocationKind = "SPACE" | "UNIT";

export type EffectiveLocationIdentity = {
  kind: EffectiveLocationKind;
  id: string;
  name: string;
  displayName: string;
  floorName: string | null;
  neighborhoodName: string | null;
  unitId: string | null;
  spaceId: string | null;
};

export type EffectiveLocationResponsibility = {
  assigned: boolean;
  source: "unit_responsibility" | "space_responsibility" | "none";
};

export type EffectivePhysicalClassification = {
  roomTypeKey: string | null;
  roomTypeLabel: string | null;
};

export type OperationalTypeAssignmentState = "assigned" | "unassigned";

export type OperationalTypeProvenance = "EXPLICIT_ASSIGNMENT" | "UNASSIGNED";

export type EffectiveOperationalType = {
  state: OperationalTypeAssignmentState;
  provenance: OperationalTypeProvenance;
  id: string | null;
  key: string | null;
  name: string | null;
  profileId: string | null;
  profileVersion: number | null;
  profileStatus: ProfileSnapshot["status"] | null;
};

export type EffectiveLocationExperience = {
  experienceKey: string;
  label: string;
  areaKey: string;
  areaName: string;
  source: ResolvedExperienceSource;
  effectiveConfiguration: ResolvedRoomProfile["areas"][number]["experiences"][number]["effectiveConfiguration"];
};

export type OverlayApplicabilityMechanism =
  | "CYCLE_LOCATION_MODE"
  | "TEAM_ROOM_MEMBERSHIP"
  | "LOG_ATTACHMENT"
  | "ASSET_PLACEMENT"
  | "WORK_PLAN_APPLICABILITY"
  | "COVERAGE_EXPECTATION";

export type OverlayProvenanceSource =
  | "EXPLICIT_APPLICABILITY"
  | "DEPARTMENT_WIDE"
  | "OPERATIONAL_TYPE_DEFAULT"
  | "EXPLICIT_LOCATION"
  | "LEGACY_PHYSICAL_ROOM_TYPE"
  | "LEGACY_UNIT_TYPE";

export type OverlayProvenance = {
  source: OverlayProvenanceSource;
  mechanism: OverlayApplicabilityMechanism;
  detail: string;
};

export type EffectiveLocationOverlayItem = {
  id: string;
  label: string;
  provenance: OverlayProvenance;
};

export type EffectiveCoverageExpectationItem = EffectiveLocationOverlayItem & {
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  cycleStableKey: string | null;
  cycleLabel: string | null;
};

export type EffectiveLocationOverlays = {
  cycles: readonly EffectiveLocationOverlayItem[];
  teams: readonly EffectiveLocationOverlayItem[];
  logAttachments: readonly EffectiveLocationOverlayItem[];
  assets: readonly EffectiveLocationOverlayItem[];
  workPlans: readonly EffectiveLocationOverlayItem[];
  coverageExpectations: readonly EffectiveCoverageExpectationItem[];
};

export type EffectiveLocationProgram = {
  asOf: string;
  department: { id: string; key: string; name: string };
  location: EffectiveLocationIdentity;
  responsibility: EffectiveLocationResponsibility;
  physical: EffectivePhysicalClassification;
  operationalType: EffectiveOperationalType;
  experiences: readonly EffectiveLocationExperience[];
  experienceDiagnostics: readonly { code: string; message: string }[];
  overlays: EffectiveLocationOverlays;
};

export type ResolveEffectiveLocationProgramInput = {
  asOf: string;
  department: { id: string; key: string; name: string };
  location: EffectiveLocationIdentity;
  responsibility: EffectiveLocationResponsibility;
  physical: EffectivePhysicalClassification;
  profile: ProfileSnapshot | null;
  roomContext: RoomContext | null;
  archetypeBinding: RoomArchetypeBindingSnapshot | null;
  exceptions: readonly RoomExceptionSnapshot[];
  overlays: EffectiveLocationOverlays;
};

const EMPTY_OVERLAYS: EffectiveLocationOverlays = {
  cycles: [],
  teams: [],
  logAttachments: [],
  assets: [],
  workPlans: [],
  coverageExpectations: [],
};

function emptyOperationalType(profile: ProfileSnapshot | null): EffectiveOperationalType {
  return {
    state: "unassigned",
    provenance: "UNASSIGNED",
    id: null,
    key: null,
    name: null,
    profileId: profile?.id ?? null,
    profileVersion: profile?.version ?? null,
    profileStatus: profile?.status ?? null,
  };
}

/**
 * Compose the inspectable Effective Location Program for one department location.
 * Does not write. Does not invent Operational Type from physical type or Unit.unitType.
 */
export function resolveEffectiveLocationProgram(
  input: ResolveEffectiveLocationProgramInput,
): EffectiveLocationProgram {
  const operationalType = emptyOperationalType(input.profile);
  let experiences: EffectiveLocationExperience[] = [];
  let experienceDiagnostics: EffectiveLocationProgram["experienceDiagnostics"] = [];

  const canResolveExperiences =
    input.location.kind === "SPACE" &&
    input.responsibility.assigned &&
    input.profile &&
    input.roomContext;

  if (canResolveExperiences && input.profile && input.roomContext) {
    const resolved = resolveDepartmentRoomProfile({
      profile: input.profile,
      room: input.roomContext,
      archetypeBinding: input.archetypeBinding,
      exceptions: input.exceptions.filter(
        (exception) => exception.unitSpaceId === input.location.id,
      ),
    });
    experienceDiagnostics = resolved.diagnostics;
    if (resolved.archetype) {
      operationalType.state = "assigned";
      operationalType.provenance = "EXPLICIT_ASSIGNMENT";
      operationalType.id = resolved.archetype.id;
      operationalType.key = resolved.archetype.key;
      operationalType.name = resolved.archetype.name;
    }
    experiences = resolved.areas.flatMap((area) =>
      area.experiences.map((experience) => ({
        experienceKey: experience.experienceKey,
        label: getExperience(experience.experienceKey)?.name ?? experience.experienceKey,
        areaKey: area.areaKey,
        areaName: area.name,
        source: experience.source,
        effectiveConfiguration: experience.effectiveConfiguration,
      })),
    );
  } else if (input.archetypeBinding && input.profile) {
    const archetype = input.profile.archetypes.find(
      (candidate) => candidate.id === input.archetypeBinding!.archetypeId,
    );
    if (archetype) {
      operationalType.state = "assigned";
      operationalType.provenance = "EXPLICIT_ASSIGNMENT";
      operationalType.id = archetype.id;
      operationalType.key = archetype.key;
      operationalType.name = archetype.name;
    }
  }

  return {
    asOf: input.asOf,
    department: input.department,
    location: input.location,
    responsibility: input.responsibility,
    physical: input.physical,
    operationalType,
    experiences,
    experienceDiagnostics,
    overlays: input.overlays ?? EMPTY_OVERLAYS,
  };
}

export function emptyLocationOverlays(): EffectiveLocationOverlays {
  return EMPTY_OVERLAYS;
}
