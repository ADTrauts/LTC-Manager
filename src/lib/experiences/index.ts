/**
 * Experience Registry — public barrel.
 *
 * Wave 14A foundation. Canonical operational vocabulary for future
 * Projection, Sidebar, and Department Administration consumers.
 *
 * Do not import catalog arrays from outside this package except via helpers.
 */

export type {
  AppIconKey,
  ExperienceCategory,
  ExperienceDefinition,
  ExperienceStatus,
  ExperienceToolDefinition,
  ExperienceToolKey,
  OperationalAreaDefinition,
  OperationalDepartmentKey,
} from "./types";

export {
  EXPERIENCE_TOOL_KEYS,
  EXPERIENCE_TOOLS,
  getExperienceTool,
  isExperienceToolKey,
  listExperienceTools,
} from "./tools";

export { EXPERIENCE_CATALOG } from "./experience-catalog";
export { OPERATIONAL_AREA_CATALOG } from "./operational-area-catalog";

export {
  EXPERIENCE_REGISTRY_VERSION,
  assertExperienceRegistryValid,
  experienceSupportsDepartment,
  findAreaForExperience,
  getExperience,
  getOperationalArea,
  isAppIconKey,
  isExperienceKey,
  isOperationalAreaKey,
  listExperiences,
  listExperiencesByArea,
  listExperiencesByDepartment,
  listExperiencesByStatus,
  listOperationalAreas,
  listOperationalAreasForDepartment,
  requireExperience,
  requireOperationalArea,
  validateExperienceRegistry,
  type ExperienceRegistryIssue,
} from "./registry";

export {
  COMPATIBILITY_MAPPINGS,
  assertCapabilitiesHaveCompatibility,
  assertCompatibilityTargetsValid,
  experienceKeyForCapability,
  experiencesFromCapabilities,
  findCompatibilityMapping,
  resolveLegacyConcept,
  toolKeyForCapability,
  type CompatibilityMapping,
  type CompatibilityTargetKind,
  type ResolvedCompatibility,
} from "./compatibility";
