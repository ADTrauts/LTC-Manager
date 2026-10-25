/**
 * Load published Operational Templates + scope assets/spaces for requirement resolution.
 * Batched — no per-employee queries.
 */

import { operationPeriodWhere, withOperatorPeriod } from "@/lib/department-authority/operator-period";
import { prisma } from "@/lib/prisma";
import { assetNotRetiredWhere } from "@/lib/asset-operations/ownership";
import { isDepartmentEngineEnabledForFacility } from "@/lib/department-operations";
import type {
  ExistingEvidenceRecordForResolve,
  PublishedCycleWindowForResolve,
  PublishedTemplateForResolve,
} from "@/lib/operational-evidence";
import {
  resolveEvidenceRequirements,
  type AssetScopeForResolve,
  type SpaceScopeForResolve,
} from "@/lib/operational-evidence";

export async function loadPublishedTemplatesForResolve(
  _facilityId: string,
  _departmentId: string,
): Promise<PublishedTemplateForResolve[]> {
  return [];
}

export async function loadEvidenceScopeForUnit(input: {
  facilityId: string;
  unitId: string;
}): Promise<{ assets: AssetScopeForResolve[]; spaces: SpaceScopeForResolve[] }> {
  const [assets, spaces] = await Promise.all([
    prisma.asset.findMany({
      where: {
        unitId: input.unitId,
        unit: { facilityId: input.facilityId },
        ...assetNotRetiredWhere(),
      },
      select: { id: true, equipmentType: true, unitId: true },
    }),
    prisma.unitSpace.findMany({
      where: { unitId: input.unitId, facilityId: input.facilityId, isActive: true },
      select: { id: true, spaceType: true, unitId: true },
    }),
  ]);
  return {
    assets: assets.map((a) => ({
      id: a.id,
      equipmentType: a.equipmentType,
      unitId: a.unitId,
    })),
    spaces: spaces.map((s) => ({
      id: s.id,
      spaceType: s.spaceType,
      unitId: s.unitId,
    })),
  };
}

export async function loadExistingEvidenceForDate(input: {
  facilityId: string;
  departmentId: string;
  operationalDate: Date;
  unitId?: string | null;
}): Promise<ExistingEvidenceRecordForResolve[]> {
  const rows = await prisma.operationalEvidenceRecord.findMany({
    where: withOperatorPeriod(
      {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDate: input.operationalDate,
      ...(input.unitId ? { unitId: input.unitId } : {}),
    },
      await operationPeriodWhere(prisma, {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
      }),
    ),
    select: {
      id: true,
      requirementKey: true,
      status: true,
      templateStableKey: true,
      templateVersion: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    requirementKey: r.requirementKey,
    status: r.status,
    templateStableKey: r.templateStableKey,
    templateVersion: r.templateVersion,
  }));
}

export async function resolveUnitEvidenceRequirements(input: {
  facilityId: string;
  departmentId: string;
  operationalDateKey: string;
  operationalDate: Date;
  now: Date;
  facilityTimezone: string;
  unitId: string;
  publishedCycles: PublishedCycleWindowForResolve[];
  pendingOfflineKeys?: string[];
  synchronizingKeys?: string[];
  conflictKeys?: string[];
}) {
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { key: true },
  });
  if (
    !(await isDepartmentEngineEnabledForFacility(
      input.facilityId,
      "evidence",
      department?.key,
    ))
  ) {
    return [];
  }

  const [publishedTemplates, scope, existingRecords] = await Promise.all([
    loadPublishedTemplatesForResolve(input.facilityId, input.departmentId),
    loadEvidenceScopeForUnit({ facilityId: input.facilityId, unitId: input.unitId }),
    loadExistingEvidenceForDate({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDate: input.operationalDate,
      unitId: input.unitId,
    }),
  ]);

  if (publishedTemplates.length === 0) {
    return [];
  }

  return resolveEvidenceRequirements({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    operationalDateKey: input.operationalDateKey,
    now: input.now,
    facilityTimezone: input.facilityTimezone,
    unitId: input.unitId,
    assets: scope.assets,
    spaces: scope.spaces,
    publishedTemplates,
    publishedCycles: input.publishedCycles,
    existingRecords,
    pendingOfflineKeys: input.pendingOfflineKeys,
    synchronizingKeys: input.synchronizingKeys,
    conflictKeys: input.conflictKeys,
  });
}
