/**
 * Projection Runtime Foundation — domain validation only.
 *
 * This validator checks snapshot shape and invariants. It does not build,
 * fetch, cache, or execute a Projection pipeline.
 */

import {
  EXPERIENCE_REGISTRY_VERSION,
  getExperience,
  isExperienceKey,
  listExperiences,
  validateExperienceContracts,
} from "@/lib/experiences";

import type {
  ProjectionArea,
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

function collectDuplicateIds(
  label: string,
  values: readonly { id: string }[],
): ProjectionValidationIssue[] {
  const issues: ProjectionValidationIssue[] = [];
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!nonEmpty(value.id)) {
      issues.push(
        issue(
          "MISSING_IDENTITY",
          `${label}[${index}] is missing a stable id`,
          `${label}[${index}].id`,
        ),
      );
      continue;
    }
    if (seen.has(value.id)) {
      issues.push(
        issue("DUPLICATE_ID", `Duplicate ${label} id ${value.id}`, label),
      );
    }
    seen.add(value.id);
  }
  return issues;
}

function detectExperienceDependencyCycles(
  snapshot: ProjectionSnapshot,
): ProjectionValidationIssue[] {
  const issues: ProjectionValidationIssue[] = [];
  const graph = new Map<string, readonly string[]>();
  for (const experience of snapshot.experiences) {
    graph.set(
      experience.reference.experienceKey,
      experience.reference.dependencyExperienceKeys,
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(key: string, stack: string[]): void {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      issues.push(
        issue(
          "CIRCULAR_EXPERIENCE_DEPENDENCY",
          `Circular Experience dependency: ${[...stack, key].join(" -> ")}`,
          "experiences",
        ),
      );
      return;
    }
    visiting.add(key);
    for (const dep of graph.get(key) ?? []) {
      if (graph.has(dep)) {
        visit(dep, [...stack, key]);
      }
    }
    visiting.delete(key);
    visited.add(key);
  }

  for (const key of graph.keys()) {
    visit(key, []);
  }
  return issues;
}

function validateAreaOrdering(areas: readonly ProjectionArea[]) {
  const issues: ProjectionValidationIssue[] = [];
  const byDepartment = new Map<string, ProjectionArea[]>();
  for (const area of areas) {
    const list = byDepartment.get(area.departmentId) ?? [];
    list.push(area);
    byDepartment.set(area.departmentId, list);
  }

  for (const [departmentId, list] of byDepartment.entries()) {
    let previous = -Infinity;
    const orders = new Set<number>();
    for (const area of list) {
      if (orders.has(area.order)) {
        issues.push(
          issue(
            "INVALID_AREA_ORDERING",
            `${departmentId}: duplicate area order ${area.order}`,
            `areas.${area.id}.order`,
          ),
        );
      }
      orders.add(area.order);
      if (area.order < previous) {
        issues.push(
          issue(
            "INVALID_AREA_ORDERING",
            `${departmentId}: area order must be ascending in snapshot`,
            `areas.${area.id}.order`,
          ),
        );
      }
      previous = area.order;
    }
  }
  return issues;
}

export function validateProjectionSnapshot(
  snapshot: ProjectionSnapshot,
): ProjectionValidationIssue[] {
  const issues: ProjectionValidationIssue[] = [];
  const facilityId = snapshot.context.identity.facilityId;

  if (!nonEmpty(snapshot.context.identity.key)) {
    issues.push(
      issue(
        "MISSING_IDENTITY",
        "Projection identity key is required",
        "context.identity.key",
      ),
    );
  }
  if (!nonEmpty(facilityId)) {
    issues.push(
      issue(
        "MISSING_IDENTITY",
        "Projection facilityId is required",
        "context.identity.facilityId",
      ),
    );
  }
  if (snapshot.context.request.facilityId !== facilityId) {
    issues.push(
      issue(
        "PROJECTION_INVARIANT",
        "Request facilityId must match Projection identity facilityId",
        "context.request.facilityId",
      ),
    );
  }
  if (
    snapshot.context.identity.revision.experienceRegistryVersion !==
      EXPERIENCE_REGISTRY_VERSION ||
    snapshot.metadata.registryVersion !== EXPERIENCE_REGISTRY_VERSION
  ) {
    issues.push(
      issue(
        "PROJECTION_INVARIANT",
        "Projection registry version must match Experience Registry version",
        "metadata.registryVersion",
      ),
    );
  }

  issues.push(...collectDuplicateIds("areas", snapshot.areas));
  issues.push(...collectDuplicateIds("experiences", snapshot.experiences));
  issues.push(...collectDuplicateIds("descriptors", snapshot.descriptors));

  const areaIds = new Set(snapshot.areas.map((area) => area.id));
  const allRegistryExperienceKeys = new Set(
    listExperiences().map((experience) => experience.key),
  );
  const experienceIds = new Set(
    snapshot.experiences.map((experience) => experience.id),
  );
  const locationIds = new Set(Object.keys(snapshot.locations.byId));
  const queryScopeIds = new Set(
    Object.values(snapshot.queryScopes.byExperience).map((scope) => scope.id),
  );

  for (const [index, area] of snapshot.areas.entries()) {
    if (!nonEmpty(area.areaKey) || !nonEmpty(area.departmentId)) {
      issues.push(
        issue(
          "MISSING_IDENTITY",
          "Projection Area requires areaKey and departmentId",
          `areas[${index}]`,
        ),
      );
    }
    for (const experienceId of area.experienceIds) {
      if (!experienceIds.has(experienceId)) {
        issues.push(
          issue(
            "AREA_EXPERIENCE_MISMATCH",
            `${area.id}: unknown Experience id ${experienceId}`,
            `areas[${index}].experienceIds`,
          ),
        );
      }
    }
  }
  issues.push(...validateAreaOrdering(snapshot.areas));

  for (const [index, experience] of snapshot.experiences.entries()) {
    const path = `experiences[${index}]`;
    const experienceKey = experience.reference.experienceKey;
    const registryExperience = getExperience(experienceKey);

    if (!isExperienceKey(experienceKey) || !registryExperience) {
      issues.push(
        issue(
          "UNKNOWN_EXPERIENCE_KEY",
          `${experience.id}: unknown Experience key ${experienceKey}`,
          `${path}.reference.experienceKey`,
        ),
      );
      continue;
    }
    if (experience.contracts.source !== "EXPERIENCE_REGISTRY") {
      issues.push(
        issue(
          "MISSING_CONTRACT_REFERENCE",
          `${experience.id}: Projection must reference Experience Registry contracts`,
          `${path}.contracts.source`,
        ),
      );
    }
    if (experience.contracts.contracts !== registryExperience.contracts) {
      issues.push(
        issue(
          "MISSING_CONTRACT_REFERENCE",
          `${experience.id}: contracts must reference the registry contract object`,
          `${path}.contracts.contracts`,
        ),
      );
    }
    if (experience.contracts.registryVersion !== EXPERIENCE_REGISTRY_VERSION) {
      issues.push(
        issue(
          "PROJECTION_INVARIANT",
          `${experience.id}: registry version mismatch`,
          `${path}.contracts.registryVersion`,
        ),
      );
    }
    for (const contractIssue of validateExperienceContracts(
      experienceKey,
      registryExperience.tools,
      experience.contracts.contracts,
      allRegistryExperienceKeys,
    )) {
      issues.push(
        issue(
          "INVALID_EXPERIENCE_CONTRACT",
          `${experience.id}: ${contractIssue.code}: ${contractIssue.message}`,
          `${path}.contracts`,
        ),
      );
    }
    if (!areaIds.has(experience.reference.areaKey)) {
      // areaKey points to the authored area key, so also allow matching by area.areaKey.
      const matchingArea = snapshot.areas.find(
        (area) => area.areaKey === experience.reference.areaKey,
      );
      if (!matchingArea) {
        issues.push(
          issue(
            "AREA_EXPERIENCE_MISMATCH",
            `${experience.id}: area ${experience.reference.areaKey} is not projected`,
            `${path}.reference.areaKey`,
          ),
        );
      }
    }
    if (!queryScopeIds.has(experience.queryScopeId)) {
      issues.push(
        issue(
          "MISSING_QUERY_SCOPE",
          `${experience.id}: query scope ${experience.queryScopeId} missing`,
          `${path}.queryScopeId`,
        ),
      );
    }
    for (const locationId of experience.reference.locationIds) {
      if (!locationIds.has(locationId)) {
        issues.push(
          issue(
            "INVALID_LOCATION_REFERENCE",
            `${experience.id}: unknown location id ${locationId}`,
            `${path}.reference.locationIds`,
          ),
        );
      }
    }
  }

  for (const [id, scope] of Object.entries(snapshot.queryScopes.byExperience)) {
    if (!experienceIds.has(id)) {
      issues.push(
        issue(
          "MISSING_QUERY_SCOPE",
          `Query scope key ${id} has no matching ProjectionExperience id`,
          `queryScopes.byExperience.${id}`,
        ),
      );
    }
    if (!getExperience(scope.experienceKey)) {
      issues.push(
        issue(
          "UNKNOWN_EXPERIENCE_KEY",
          `Query scope references unknown Experience ${scope.experienceKey}`,
          `queryScopes.byExperience.${id}.experienceKey`,
        ),
      );
    }
    if (!scope.domains.length || !scope.rules.length) {
      issues.push(
        issue(
          "MISSING_QUERY_SCOPE",
          `${scope.id}: domains and rules are required`,
          `queryScopes.byExperience.${id}`,
        ),
      );
    }
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
    for (const experienceKey of node.experienceKeys) {
      if (!getExperience(experienceKey)) {
        issues.push(
          issue(
            "UNKNOWN_EXPERIENCE_KEY",
            `${node.id}: unknown Experience key ${experienceKey}`,
            `${path}.experienceKeys`,
          ),
        );
      }
    }
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
    const sourceKnown =
      areaIds.has(descriptor.sourceId) ||
      experienceIds.has(descriptor.sourceId) ||
      locationIds.has(descriptor.sourceId) ||
      queryScopeIds.has(descriptor.sourceId);
    if (!sourceKnown) {
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

  if (
    snapshot.context.request.lens.mode === "FACILITY" &&
    snapshot.facilityOverview
  ) {
    if (snapshot.areas.length > 0 || snapshot.experiences.length > 0) {
      issues.push(
        issue(
          "FACILITY_OVERVIEW_FLATTENED",
          "Facility Overview must compose department snapshots, not flatten areas/experiences",
          "facilityOverview",
        ),
      );
    }
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

  issues.push(...detectExperienceDependencyCycles(snapshot));
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

