/**
 * Experience catalog helpers — Wave 15AC defineExperience.
 */

import {
  buildExperienceContracts,
  type ExperienceContractBuildOptions,
  type ExperienceContracts,
} from "./contracts";
import type {
  ExperienceCategory,
  ExperienceDefinition,
  ExperienceStatus,
  ExperienceToolKey,
  OperationalDepartmentKey,
} from "./types";
import type { AppIconKey } from "@/lib/design-system/icons";

export type DefineExperienceInput = {
  key: string;
  name: string;
  description: string;
  departments: readonly OperationalDepartmentKey[];
  icon: AppIconKey;
  status?: ExperienceStatus;
  tools: readonly ExperienceToolKey[];
  category: ExperienceCategory;
  version?: number;
  contract: Omit<ExperienceContractBuildOptions, "experienceKey" | "experienceName" | "tools"> & {
    /** Optional full contracts replacement after build (rare). */
    replaceContracts?: ExperienceContracts;
  };
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Define one catalog Experience with identity + full declarative contracts.
 * Keeps a single registry path — no parallel metadata.
 */
export function defineExperience(
  input: DefineExperienceInput,
): ExperienceDefinition {
  const {
    replaceContracts,
    ...contractOptions
  } = input.contract;

  const contracts = deepFreeze(
    replaceContracts ??
    buildExperienceContracts({
      experienceKey: input.key,
      experienceName: input.name,
      tools: input.tools,
      ...contractOptions,
    }),
  );

  return {
    id: input.key,
    key: input.key,
    name: input.name,
    description: input.description,
    departments: input.departments,
    icon: input.icon,
    status: input.status ?? "active",
    tools: input.tools,
    category: input.category,
    version: input.version ?? 2,
    contracts,
  };
}
