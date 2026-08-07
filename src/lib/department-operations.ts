/**
 * Department-keyed operational feature gates (Phase 11B).
 * DIETARY uses existing DIETARY_* flags; EVS uses EVS_OPERATIONS_ENABLED umbrella.
 * Does not enable OPERATION_ENGINE_ENABLED or TASK_SYNC_ENABLED.
 */

import {
  isDietaryAssetOperationsEnabled,
  isDietaryJobFlowEnabled,
  isDietaryOperationalCyclesEnabled,
  isDietaryOperationalEvidenceEnabled,
  isDietaryWorkPlansEnabled,
  isEvsOperationsEnabled,
} from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export type OperationalDepartmentKey = "DIETARY" | "EVS" | "PLANT";

type StaffingOperationalKey = "DIETARY" | "EVS";

export type StaffingOperationalFeature =
  | "workPlans"
  | "jobFlow"
  | "cycles"
  | "evidence"
  | "asset";

function normalizeKey(key: string | null | undefined): OperationalDepartmentKey | null {
  if (key === "DIETARY" || key === "EVS" || key === "PLANT") return key;
  return null;
}

export function isDepartmentOperationalCyclesEnabled(
  key: string | null | undefined,
): boolean {
  const k = normalizeKey(key);
  if (k === "DIETARY") return isDietaryOperationalCyclesEnabled();
  if (k === "EVS") return isEvsOperationsEnabled();
  return false;
}

export function isDepartmentJobFlowEnabled(key: string | null | undefined): boolean {
  const k = normalizeKey(key);
  if (k === "DIETARY") return isDietaryJobFlowEnabled();
  if (k === "EVS") return isEvsOperationsEnabled();
  return false;
}

export function isDepartmentOperationalEvidenceEnabled(
  key: string | null | undefined,
): boolean {
  const k = normalizeKey(key);
  if (k === "DIETARY") return isDietaryOperationalEvidenceEnabled();
  if (k === "EVS") return isEvsOperationsEnabled();
  return false;
}

export function isDepartmentAssetOperationsEnabled(
  key: string | null | undefined,
): boolean {
  const k = normalizeKey(key);
  if (k === "DIETARY") return isDietaryAssetOperationsEnabled();
  if (k === "EVS") return isEvsOperationsEnabled();
  return false;
}

export function isDepartmentWorkPlansEnabled(key: string | null | undefined): boolean {
  const k = normalizeKey(key);
  if (k === "DIETARY") return isDietaryWorkPlansEnabled();
  if (k === "EVS") return isEvsOperationsEnabled();
  return false;
}

function isStaffingKey(key: string | null | undefined): key is StaffingOperationalKey {
  return key === "DIETARY" || key === "EVS";
}

function isFeatureEnabledForKey(
  feature: StaffingOperationalFeature,
  key: string | null | undefined,
): boolean {
  switch (feature) {
    case "workPlans":
      return isDepartmentWorkPlansEnabled(key);
    case "jobFlow":
      return isDepartmentJobFlowEnabled(key);
    case "cycles":
      return isDepartmentOperationalCyclesEnabled(key);
    case "evidence":
      return isDepartmentOperationalEvidenceEnabled(key);
    case "asset":
      return isDepartmentAssetOperationsEnabled(key);
  }
}

/** True when Dietary or EVS has the named staffing feature family enabled. */
export function isAnyStaffingOperationalFeatureEnabled(
  feature: StaffingOperationalFeature,
): boolean {
  return (
    isFeatureEnabledForKey(feature, "DIETARY") || isFeatureEnabledForKey(feature, "EVS")
  );
}

/**
 * Resolve DIETARY or EVS department for `/staffing/*` when that department's
 * matching feature flag is enabled (Dietary: DIETARY_*; EVS: EVS_OPERATIONS_ENABLED).
 */
export async function resolveStaffingOperationalDepartment(input: {
  facilityId: string;
  activeDepartmentId: string | null;
  feature?: StaffingOperationalFeature;
  preferKeys?: readonly StaffingOperationalKey[];
}): Promise<{ id: string; name: string; key: StaffingOperationalKey } | null> {
  const feature = input.feature ?? "workPlans";
  const preferKeys = input.preferKeys ?? (["DIETARY", "EVS"] as const);

  if (input.activeDepartmentId) {
    const active = await prisma.department.findFirst({
      where: {
        id: input.activeDepartmentId,
        facilityId: input.facilityId,
        isActive: true,
      },
      select: { id: true, name: true, key: true },
    });
    if (
      active &&
      isStaffingKey(active.key) &&
      isFeatureEnabledForKey(feature, active.key)
    ) {
      return { id: active.id, name: active.name, key: active.key };
    }
  }

  for (const key of preferKeys) {
    if (!isFeatureEnabledForKey(feature, key)) continue;
    const dept = await prisma.department.findFirst({
      where: { facilityId: input.facilityId, key, isActive: true },
      select: { id: true, name: true, key: true },
    });
    if (dept && isStaffingKey(dept.key)) {
      return { id: dept.id, name: dept.name, key: dept.key };
    }
  }

  return null;
}

/**
 * Look up department key and assert the named feature is enabled for that department.
 */
export async function requireDepartmentFeatureEnabled(
  departmentId: string,
  feature: StaffingOperationalFeature,
  message?: string,
): Promise<{ id: string; name: string; key: string }> {
  const dept = await prisma.department.findFirst({
    where: { id: departmentId, isActive: true },
    select: { id: true, name: true, key: true },
  });
  if (!dept || !isFeatureEnabledForKey(feature, dept.key)) {
    throw new Error(message ?? "This operational feature is not enabled for the department.");
  }
  return dept;
}

/**
 * Resolve DIETARY|EVS for Unit Workspace Job Flow / cycles:
 * prefer active department when flagged; else Dietary; else EVS.
 */
export async function resolveUnitOperationalDepartment(input: {
  facilityId: string;
  activeDepartmentId: string | null;
  unitId?: string | null;
  feature?: StaffingOperationalFeature;
}): Promise<{ id: string; name: string; key: StaffingOperationalKey } | null> {
  const feature = input.feature ?? "jobFlow";

  const fromActive = await resolveStaffingOperationalDepartment({
    facilityId: input.facilityId,
    activeDepartmentId: input.activeDepartmentId,
    feature,
  });
  if (fromActive) return fromActive;

  if (input.unitId) {
    const responsibilities = await prisma.unitDepartmentResponsibility.findMany({
      where: {
        unitId: input.unitId,
        unit: { facilityId: input.facilityId, isActive: true },
        department: { isActive: true, key: { in: ["DIETARY", "EVS"] } },
      },
      select: {
        department: { select: { id: true, name: true, key: true } },
      },
    });
    for (const key of ["DIETARY", "EVS"] as const) {
      if (!isFeatureEnabledForKey(feature, key)) continue;
      const match = responsibilities.find((r) => r.department.key === key);
      if (match && isStaffingKey(match.department.key)) {
        return {
          id: match.department.id,
          name: match.department.name,
          key: match.department.key,
        };
      }
    }
  }

  return null;
}
