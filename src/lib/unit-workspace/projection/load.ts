/**
 * Wave 15H — Unit Workspace Projection loader.
 *
 * purpose UNIT_WORKSPACE + unit focus → Workspace adapter.
 * Flag off → callers use legacy loadUnitWorkspace (no mix).
 */

import type { AppJwtPayload } from "@/lib/auth";
import {
  resolveFacilityVocabulary,
  type FacilityVocabulary,
} from "@/lib/facility-builder/facility-vocabulary";
import { isProjectionUnitWorkspaceEnabled } from "@/lib/feature-flags";
import {
  resolveSessionProjection,
  type LoadProjectedLocationOptions,
} from "@/lib/locations";
import { prisma } from "@/lib/prisma";
import type {
  ProjectionRuntimeMemo,
  ProjectionRuntimeResult,
  ProjectionSourceLoadDb,
} from "@/lib/projection";

import { adaptProjectionToUnitWorkspace } from "./adapt-projection";
import type { UnitWorkspaceProjectionView } from "./types";

export type LoadUnitWorkspaceProjectionOptions = Omit<
  LoadProjectedLocationOptions,
  "purpose" | "focus"
> & {
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  vocabulary?: FacilityVocabulary;
  hierarchyRole?: "FLOOR" | "NEIGHBORHOOD" | "LEGACY";
};

export type LoadUnitWorkspaceProjectionResult = {
  enabled: boolean;
  view: UnitWorkspaceProjectionView | null;
  usedLegacyWorkspace: boolean;
  error: string | null;
};

async function loadFacilityVocabulary(
  facilityId: string,
): Promise<FacilityVocabulary> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: {
      vocabularyProfile: true,
      vocabularyLevel1Label: true,
      vocabularyLevel2Label: true,
      vocabularyLevel3Label: true,
    },
  });
  return resolveFacilityVocabulary(facility);
}

function mapHierarchyRole(
  role: string | null | undefined,
): "FLOOR" | "NEIGHBORHOOD" | "LEGACY" {
  if (role === "FLOOR") return "FLOOR";
  if (role === "NEIGHBORHOOD") return "NEIGHBORHOOD";
  return "LEGACY";
}

/**
 * Load Unit Workspace Experience panels from Projection.
 * Never mixes with legacy module composition when enabled.
 */
export async function loadUnitWorkspaceProjection(
  session: AppJwtPayload,
  unitId: string,
  options: LoadUnitWorkspaceProjectionOptions = {},
): Promise<LoadUnitWorkspaceProjectionResult> {
  if (!isProjectionUnitWorkspaceEnabled()) {
    return {
      enabled: false,
      view: null,
      usedLegacyWorkspace: true,
      error: null,
    };
  }

  const facilityId = session.facilityId;
  if (!facilityId) {
    return {
      enabled: true,
      view: null,
      usedLegacyWorkspace: false,
      error: "Unit Workspace requires a facility session",
    };
  }

  let hierarchyRole = options.hierarchyRole;
  if (!hierarchyRole) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, facilityId },
      select: { hierarchyRole: true },
    });
    hierarchyRole = mapHierarchyRole(unit?.hierarchyRole);
  }

  const resolved = await resolveSessionProjection(session, {
    ...options,
    purpose: "UNIT_WORKSPACE",
    focus: {
      kind: "UNIT",
      facilityId,
      unitId,
      hierarchyRole,
    },
  });

  if (!resolved.ok || !resolved.runtime) {
    return {
      enabled: true,
      view: {
        facilityId,
        unitId,
        unitIncluded: false,
        lensMode: "DEPARTMENT",
        lensKey: "fail-closed",
        sections: [],
        roomContext: [],
        level1Label: "Floor",
        level2Label: "Neighborhood",
        level3Label: "Room",
        error: resolved.error ?? "Projection failed",
      },
      usedLegacyWorkspace: false,
      error: resolved.error ?? "Projection failed",
    };
  }

  const vocabulary =
    options.vocabulary ?? (await loadFacilityVocabulary(facilityId));
  const view = adaptProjectionToUnitWorkspace(
    resolved.runtime.snapshot,
    unitId,
    vocabulary,
    null,
  );

  if (!view.unitIncluded) {
    return {
      enabled: true,
      view: {
        ...view,
        error:
          view.error ??
          "This location is not available in the active department projection",
      },
      usedLegacyWorkspace: false,
      error:
        "This location is not available in the active department projection",
    };
  }

  return {
    enabled: true,
    view,
    usedLegacyWorkspace: false,
    error: null,
  };
}
