import type { InspectionResponseType } from "@prisma/client";

export type UnitInspectionDefinitionRow = {
  id: string;
  name: string;
  description: string | null;
  frequency: string | null;
  departmentId: string | null;
  unitId: string | null;
  itemCount: number;
};

export type UnitInspectionHistoryFinding = {
  submissionItemId: string;
  itemLabel: string;
  followUpStatus: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | null;
  followUpTaskId: string | null;
};

export type UnitInspectionHistoryRow = {
  id: string;
  definitionName: string;
  submittedAt: Date;
  result: "PASSED" | "PASSED_WITH_FINDINGS" | "FAILED";
  submittedByName: string | null;
  findings: UnitInspectionHistoryFinding[];
};

export type UnitOpenInspectionFollowUp = {
  id: string;
  title: string;
  status: "OPEN" | "IN_PROGRESS";
  description: string | null;
};

/**
 * Active definitions available for a unit:
 * - same facility
 * - isActive
 * - unitId is null (facility/department-wide) OR matches the unit
 * - optional department filter when provided
 */
export function filterInspectionsForUnit(input: {
  definitions: Array<{
    id: string;
    name: string;
    description: string | null;
    frequency: string | null;
    facilityId: string;
    departmentId: string | null;
    unitId: string | null;
    isActive: boolean;
    _count?: { items: number };
    items?: unknown[];
  }>;
  facilityId: string;
  unitId: string;
  departmentId?: string | null;
}): UnitInspectionDefinitionRow[] {
  const { definitions, facilityId, unitId, departmentId = null } = input;

  return definitions
    .filter((definition) => {
      if (!definition.isActive) return false;
      if (definition.facilityId !== facilityId) return false;
      if (definition.unitId && definition.unitId !== unitId) return false;
      if (departmentId && definition.departmentId && definition.departmentId !== departmentId) {
        return false;
      }
      return true;
    })
    .map((definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      frequency: definition.frequency,
      departmentId: definition.departmentId,
      unitId: definition.unitId,
      itemCount: definition._count?.items ?? definition.items?.length ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const INSPECTION_RESPONSE_TYPE_OPTIONS: Array<{
  value: InspectionResponseType;
  label: string;
}> = [
  { value: "PASS_FAIL", label: "Pass / Fail" },
  { value: "YES_NO", label: "Yes / No" },
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "TEMPERATURE", label: "Temperature" },
];
