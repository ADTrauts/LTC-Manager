/**
 * Experience Registry — public barrel.
 *
 * Wave 14A foundation + Wave 15AC Experience Contracts.
 * Canonical operational vocabulary for future Projection, Shell, and homes.
 *
 * Do not import catalog arrays from outside this package except via helpers.
 */

export type {
  AppIconKey,
  ExperienceCategory,
  ExperienceContracts,
  ExperienceDefinition,
  ExperienceStatus,
  ExperienceToolDefinition,
  ExperienceToolKey,
  OperationalAreaDefinition,
  OperationalDepartmentKey,
} from "./types";

export type {
  ExperienceActionCategory,
  ExperienceActionDeclaration,
  ExperienceActionPlacement,
  ExperienceAvailabilityContract,
  ExperienceCardDeclaration,
  ExperienceCardKind,
  ExperienceContractBuildOptions,
  ExperienceContractIssue,
  ExperienceDensity,
  ExperienceQueryScopeContract,
  ExperienceSectionDeclaration,
  ExperienceSectionKey,
  ExperienceStatusContract,
  ExperienceStatusKey,
  ExperienceToolHostDeclaration,
  ExperienceWidgetDeclaration,
  ExperienceWidgetKind,
  HomeContributionContract,
  NavigationContributionEntry,
  QueryScopeGrain,
} from "./contracts";

export {
  EXPERIENCE_ACTION_CATEGORIES,
  EXPERIENCE_ACTION_PLACEMENTS,
  EXPERIENCE_CARD_KINDS,
  EXPERIENCE_DENSITIES,
  EXPERIENCE_SECTION_KEYS,
  EXPERIENCE_WIDGET_KINDS,
  FORBIDDEN_SECTION_KEYS,
  QUERY_SCOPE_GRAINS,
  STATUS_VOCABULARY,
  buildExperienceContracts,
  isExperienceCardKind,
  isExperienceSectionKey,
  isExperienceWidgetKind,
  validateExperienceContracts,
} from "./contracts";

export {
  EXPERIENCE_TOOL_KEYS,
  EXPERIENCE_TOOLS,
  getExperienceTool,
  isExperienceToolKey,
  listExperienceTools,
} from "./tools";

export { EXPERIENCE_CATALOG } from "./experience-catalog";
export { OPERATIONAL_AREA_CATALOG } from "./operational-area-catalog";
export { defineExperience } from "./define-experience";

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
