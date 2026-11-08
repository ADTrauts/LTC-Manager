/**
 * Projection snapshot checks for the physical location tree.
 */

import type {
  ProjectionDiagnostic,
  ProjectionDiagnosticCode,
  ProjectionDiagnosticSeverity,
  ProjectionLocationNode,
  ProjectionLocationReference,
  ProjectionSnapshot,
} from "./types";

export type ProjectionValidationIssue = ProjectionDiagnostic;

function issue(
  code: ProjectionDiagnosticCode,
  message: string,
  path?: string,
  severity: ProjectionDiagnosticSeverity = "ERROR",
): ProjectionValidationIssue {
  return { code, message, path, severity };
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validateLocationReference(
  reference: ProjectionLocationReference,
  snapshotFacilityId: string,
  path: string,
): ProjectionValidationIssue[] {
  const issues: ProjectionValidationIssue[] = [];
  if (reference.facilityId !== snapshotFacilityId) {
    issues.push(
      issue(
        "INVALID_LOCATION_REFERENCE",
        `Location reference facility ${reference.facilityId} does not match snapshot facility ${snapshotFacilityId}`,
        path,
      ),
    );
  }
  if (reference.kind === "UNIT" && !nonEmpty(reference.unitId)) {
    issues.push(
      issue("INVALID_LOCATION_REFERENCE", "UNIT reference requires unitId", path),
    );
  }
  if (reference.kind === "SPACE") {
    if (!nonEmpty(reference.unitId) || !nonEmpty(reference.spaceId)) {
      issues.push(
        issue(
          "INVALID_LOCATION_REFERENCE",
          "SPACE reference requires both unitId and spaceId",
          path,
        ),
      );
    }
  }
  return issues;
}

function walkLocations(
  nodes: readonly ProjectionLocationNode[],
  visit: (node: ProjectionLocationNode, path: string) => void,
  basePath = "locations.roots",
): void {
  nodes.forEach((node, index) => {
    const path = `${basePath}[${index}]`;
    visit(node, path);
    walkLocations(node.children, visit, `${path}.children`);
  });
}

export function validateProjectionSnapshot(
  snapshot: ProjectionSnapshot,
): ProjectionValidationIssue[] {
  const issues: ProjectionValidationIssue[] = [];
  const facilityId = snapshot.context.request.facilityId;
  const locationIds = new Set(Object.keys(snapshot.locations.byId));

  if (!nonEmpty(snapshot.context.identity.key)) {
    issues.push(
      issue("MISSING_IDENTITY", "Projection identity key is required", "context.identity.key"),
    );
  }

  walkLocations(snapshot.locations.roots, (node, path) => {
    if (snapshot.locations.byId[node.id] !== node) {
      issues.push(
        issue(
          "INVALID_LOCATION_REFERENCE",
          `${node.id}: locations.byId must reference the same node object`,
          path,
        ),
      );
    }
    issues.push(
      ...validateLocationReference(node.reference, facilityId, `${path}.reference`),
    );
  });

  for (const id of snapshot.locations.actionableIds) {
    const node = snapshot.locations.byId[id];
    if (!node || node.presentation !== "ACTIONABLE") {
      issues.push(
        issue(
          "INVALID_LOCATION_REFERENCE",
          `Actionable location ${id} must exist and be ACTIONABLE`,
          "locations.actionableIds",
        ),
      );
    }
  }

  for (const [index, descriptor] of snapshot.descriptors.entries()) {
    if (!nonEmpty(descriptor.id) || !nonEmpty(descriptor.sourceId)) {
      issues.push(
        issue(
          "INVALID_DESCRIPTOR",
          "Projection Descriptor requires id and sourceId",
          `descriptors[${index}]`,
        ),
      );
    }
    if (!locationIds.has(descriptor.sourceId)) {
      issues.push(
        issue(
          "INVALID_DESCRIPTOR",
          `${descriptor.id}: sourceId ${descriptor.sourceId} is not in snapshot`,
          `descriptors[${index}].sourceId`,
        ),
      );
    }
  }

  if (
    snapshot.plantPolicy &&
    snapshot.plantPolicy.createsRoomAssignments !== false
  ) {
    issues.push(
      issue(
        "PLANT_POLICY_ASSIGNMENT_COPY",
        "Plant policy must never create room assignments",
        "plantPolicy.createsRoomAssignments",
      ),
    );
  }
  if (snapshot.plantPolicy) {
    for (const locationId of snapshot.plantPolicy.coveredLocationIds) {
      if (!locationIds.has(locationId)) {
        issues.push(
          issue(
            "INVALID_LOCATION_REFERENCE",
            `Plant policy covers unknown location ${locationId}`,
            "plantPolicy.coveredLocationIds",
          ),
        );
      }
    }
  }

  if (
    snapshot.context.request.lens.mode === "FACILITY" &&
    snapshot.facilityOverview
  ) {
    for (const [index, departmentSnapshot] of snapshot.facilityOverview
      .departmentSnapshots.entries()) {
      if (departmentSnapshot.context.request.lens.mode !== "DEPARTMENT") {
        issues.push(
          issue(
            "FACILITY_OVERVIEW_FLATTENED",
            `Facility Overview child ${index} must be a department snapshot`,
            `facilityOverview.departmentSnapshots[${index}]`,
          ),
        );
      }
    }
  }

  return issues;
}

export function assertProjectionSnapshotValid(snapshot: ProjectionSnapshot): void {
  const issues = validateProjectionSnapshot(snapshot);
  if (issues.length > 0) {
    throw new Error(
      `Projection snapshot invalid:\n${issues
        .map((i) => `- ${i.code}: ${i.message}`)
        .join("\n")}`,
    );
  }
}
