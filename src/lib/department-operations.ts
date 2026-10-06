/**
 * Department-keyed operational feature gates.
 *
 * Shared engines (cycles, job flow, evidence, work, assets) admit any active
 * department. DIETARY / EVS / PLANT keep their existing release flags.
 * Custom keys do not need a compile-time flag and do not receive domain
 * capabilities from those flags.
 *
 * Does not enable OPERATION_ENGINE_ENABLED or TASK_SYNC_ENABLED.
 */

import {
  DOMAIN_DEPARTMENT_KEYS,
  isDomainDepartmentKey,
  type DomainDepartmentKey,
} from "@/lib/department-admission";
import {
  isDietaryAssetOperationsEnabled,
  isDietaryJobFlowEnabled,
  isDietaryOperationalCyclesEnabled,
  isDietaryOperationalEvidenceEnabled,
  isDietaryWorkPlansEnabled,
  isEvsOperationsEnabled,
  isPlantOperationsEnabled,
} from "@/lib/feature-flags";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import { prisma } from "@/lib/prisma";

export type { DomainDepartmentKey };
/** @deprecated Use DomainDepartmentKey for domain modules; any string key may be operational. */
export type OperationalDepartmentKey = string;

export type StaffingOperationalFeature =
  | "workPlans"
  | "jobFlow"
  | "cycles"
  | "evidence"
  | "asset";

function isSharedOperationalEngineEnabledForKey(
  key: string | null | undefined,
  dietaryFlag: () => boolean,
  evsFlag: () => boolean,
  plantFlag: () => boolean,
): boolean {
  if (!key) return false;
  if (key === "DIETARY") return dietaryFlag();
  if (key === "EVS") return evsFlag();
  if (key === "PLANT") return plantFlag();
  return true;
}

export function isDepartmentOperationalCyclesEnabled(
  key: string | null | undefined,
): boolean {
  return isSharedOperationalEngineEnabledForKey(
    key,
    isDietaryOperationalCyclesEnabled,
    isEvsOperationsEnabled,
    isPlantOperationsEnabled,
  );
}

export function isDepartmentJobFlowEnabled(key: string | null | undefined): boolean {
  return isSharedOperationalEngineEnabledForKey(
    key,
    isDietaryJobFlowEnabled,
    isEvsOperationsEnabled,
    isPlantOperationsEnabled,
  );
}

export function isDepartmentOperationalEvidenceEnabled(
  key: string | null | undefined,
): boolean {
  return isSharedOperationalEngineEnabledForKey(
    key,
    isDietaryOperationalEvidenceEnabled,
    isEvsOperationsEnabled,
    isPlantOperationsEnabled,
  );
}

export function isDepartmentAssetOperationsEnabled(
  key: string | null | undefined,
): boolean {
  return isSharedOperationalEngineEnabledForKey(
    key,
    isDietaryAssetOperationsEnabled,
    isEvsOperationsEnabled,
    isPlantOperationsEnabled,
  );
}

export function isDepartmentWorkPlansEnabled(key: string | null | undefined): boolean {
  return isSharedOperationalEngineEnabledForKey(
    key,
    isDietaryWorkPlansEnabled,
    isEvsOperationsEnabled,
    isPlantOperationsEnabled,
  );
}

export async function isDepartmentEngineEnabledForFacility(
  facilityId: string,
  feature: StaffingOperationalFeature,
  key: string | null | undefined,
  session?: { authKind?: string | null } | null,
): Promise<boolean> {
  if (key === "PLANT") {
    return isPlantRuntimeEnabled(facilityId, session);
  }
  return isFeatureEnabledForKey(feature, key);
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

/**
 * True when a staffing engine surface should be reachable.
 * Trio departments still honor their release flags. An active custom
 * department key admits the shared engine without a new flag.
 */
export function isAnyStaffingOperationalFeatureEnabled(
  feature: StaffingOperationalFeature,
  activeDepartmentKey?: string | null,
): boolean {
  if (isFeatureEnabledForKey(feature, activeDepartmentKey)) {
    return true;
  }
  return (
    isFeatureEnabledForKey(feature, "DIETARY") ||
    isFeatureEnabledForKey(feature, "EVS") ||
    isFeatureEnabledForKey(feature, "PLANT")
  );
}

/**
 * Resolve the department for `/staffing/*` when that department's
 * matching shared engine is enabled.
 */
export async function resolveStaffingOperationalDepartment(input: {
  facilityId: string;
  activeDepartmentId: string | null;
  feature?: StaffingOperationalFeature;
  preferKeys?: readonly DomainDepartmentKey[];
  /** When true, resolve even if that department's release flag is off. */
  skipFeatureGate?: boolean;
  session?: { authKind?: string | null } | null;
}): Promise<{ id: string; name: string; key: string } | null> {
  const feature = input.feature ?? "workPlans";
  const preferKeys = input.preferKeys ?? DOMAIN_DEPARTMENT_KEYS;
  const gated = !input.skipFeatureGate;

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
      (!gated ||
        (await isDepartmentEngineEnabledForFacility(
          input.facilityId,
          feature,
          active.key,
          input.session,
        )))
    ) {
      return { id: active.id, name: active.name, key: active.key };
    }
  }

  for (const key of preferKeys) {
    if (
      gated &&
      !(await isDepartmentEngineEnabledForFacility(
        input.facilityId,
        feature,
        key,
        input.session,
      ))
    ) {
      continue;
    }
    const dept = await prisma.department.findFirst({
      where: { facilityId: input.facilityId, key, isActive: true },
      select: { id: true, name: true, key: true },
    });
    if (dept) {
      return { id: dept.id, name: dept.name, key: dept.key };
    }
  }

  const custom = await prisma.department.findFirst({
    where: {
      facilityId: input.facilityId,
      isActive: true,
      key: { notIn: [...DOMAIN_DEPARTMENT_KEYS] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, key: true },
  });
  if (
    custom &&
    (!gated ||
      (await isDepartmentEngineEnabledForFacility(
        input.facilityId,
        feature,
        custom.key,
        input.session,
      )))
  ) {
    return { id: custom.id, name: custom.name, key: custom.key };
  }

  return null;
}

/**
 * Look up department key and assert the named shared engine is enabled.
 */
export async function requireDepartmentFeatureEnabled(
  departmentId: string,
  feature: StaffingOperationalFeature,
  message?: string,
): Promise<{ id: string; name: string; key: string }> {
  const dept = await prisma.department.findFirst({
    where: { id: departmentId, isActive: true },
    select: { id: true, name: true, key: true, facilityId: true },
  });
  if (
    !dept ||
    !(await isDepartmentEngineEnabledForFacility(dept.facilityId, feature, dept.key))
  ) {
    throw new Error(message ?? "This operational feature is not enabled for the department.");
  }
  return { id: dept.id, name: dept.name, key: dept.key };
}

/**
 * Resolve an operational department for Unit Workspace Job Flow / cycles:
 * prefer the active admitted department; else domain-key order among
 * responsible departments; else any other responsible admitted department.
 */
export async function resolveUnitOperationalDepartment(input: {
  facilityId: string;
  activeDepartmentId: string | null;
  unitId?: string | null;
  feature?: StaffingOperationalFeature;
  session?: { authKind?: string | null } | null;
}): Promise<{ id: string; name: string; key: string } | null> {
  const feature = input.feature ?? "jobFlow";

  const fromActive = await resolveStaffingOperationalDepartment({
    facilityId: input.facilityId,
    activeDepartmentId: input.activeDepartmentId,
    feature,
    session: input.session,
  });
  if (fromActive) return fromActive;

  if (input.unitId) {
    const responsibilities = await prisma.unitDepartmentResponsibility.findMany({
      where: {
        unitId: input.unitId,
        unit: { facilityId: input.facilityId, isActive: true },
        department: { isActive: true },
      },
      select: {
        department: { select: { id: true, name: true, key: true } },
      },
    });
    const preferred = DOMAIN_DEPARTMENT_KEYS.map((key) =>
      responsibilities.find((row) => row.department.key === key),
    ).filter((row): row is (typeof responsibilities)[number] => Boolean(row));
    const custom = responsibilities.filter(
      (row) => !isDomainDepartmentKey(row.department.key),
    );
    for (const match of [...preferred, ...custom]) {
      if (
        !(await isDepartmentEngineEnabledForFacility(
          input.facilityId,
          feature,
          match.department.key,
          input.session,
        ))
      ) {
        continue;
      }
      return {
        id: match.department.id,
        name: match.department.name,
        key: match.department.key,
      };
    }
  }

  return null;
}

/** Resolve Plant department when Plant domain operations are enabled. */
export async function resolvePlantOperationalDepartment(input: {
  facilityId: string;
  feature?: StaffingOperationalFeature;
  session?: { authKind?: string | null } | null;
}): Promise<{ id: string; name: string; key: "PLANT" } | null> {
  const feature = input.feature ?? "jobFlow";
  if (
    !(await isDepartmentEngineEnabledForFacility(
      input.facilityId,
      feature,
      "PLANT",
      input.session,
    ))
  ) {
    return null;
  }
  const dept = await prisma.department.findFirst({
    where: { facilityId: input.facilityId, key: "PLANT", isActive: true },
    select: { id: true, name: true, key: true },
  });
  if (!dept || dept.key !== "PLANT") return null;
  return { id: dept.id, name: dept.name, key: "PLANT" };
}
