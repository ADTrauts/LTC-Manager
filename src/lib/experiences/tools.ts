/**
 * Experience tools — instruments, not Experiences.
 *
 * Logs, Knowledge, Forms, Tasks, and Records appear inside owning Experiences.
 * They are never top-level catalog Experiences or navigation destinations.
 */

import type { ExperienceToolDefinition, ExperienceToolKey } from "./types";

export const EXPERIENCE_TOOL_KEYS = [
  "LOGS",
  "KNOWLEDGE",
  "FORMS",
  "TASKS",
  "RECORDS",
] as const satisfies readonly ExperienceToolKey[];

export const EXPERIENCE_TOOLS: readonly ExperienceToolDefinition[] = [
  {
    id: "LOGS",
    key: "LOGS",
    name: "Logs",
    description:
      "Recurring operational capture surfaces (temperature, cleaning, rounds). Always owned by an Experience.",
  },
  {
    id: "KNOWLEDGE",
    key: "KNOWLEDGE",
    name: "Knowledge",
    description:
      "Reference guidance and SOPs surfaced in context of the owning Experience.",
  },
  {
    id: "FORMS",
    key: "FORMS",
    name: "Forms",
    description:
      "Structured data capture used by Experiences; configured centrally, shown in work.",
  },
  {
    id: "TASKS",
    key: "TASKS",
    name: "Tasks",
    description:
      "Actionable work items generated or tracked inside an Experience.",
  },
  {
    id: "RECORDS",
    key: "RECORDS",
    name: "Records",
    description:
      "Durable operational records produced by an Experience (batches, inspections, events).",
  },
] as const;

const toolByKey = new Map<ExperienceToolKey, ExperienceToolDefinition>(
  EXPERIENCE_TOOLS.map((tool) => [tool.key, tool]),
);

export function getExperienceTool(
  key: string,
): ExperienceToolDefinition | undefined {
  return toolByKey.get(key as ExperienceToolKey);
}

export function listExperienceTools(): ExperienceToolDefinition[] {
  return [...EXPERIENCE_TOOLS];
}

export function isExperienceToolKey(value: string): value is ExperienceToolKey {
  return toolByKey.has(value as ExperienceToolKey);
}
