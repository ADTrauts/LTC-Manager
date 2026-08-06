/**
 * Load published Operational Templates + scope assets/spaces for requirement resolution.
 * Batched — no per-employee queries.
 */

import { prisma } from "@/lib/prisma";
import { isDietaryOperationalEvidenceEnabled } from "@/lib/feature-flags";
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
  facilityId: string,
  departmentId: string,
): Promise<PublishedTemplateForResolve[]> {
  const rows = await prisma.operationalTemplate.findMany({
    where: { facilityId, departmentId, status: "PUBLISHED" },
    include: {
      fields: { orderBy: { displaySequence: "asc" } },
      applicabilities: true,
      schedules: true,
    },
  });

  return rows.map((t) => ({
    id: t.id,
    stableKey: t.stableKey,
    version: t.version,
    name: t.name,
    description: t.description,
    instructions: t.instructions,
    purposeType: t.purposeType,
    status: t.status,
    allowAdHoc: t.allowAdHoc,
    fields: t.fields.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.label,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      displaySequence: f.displaySequence,
      helpText: f.helpText,
      unitLabel: f.unitLabel,
      minNumber: f.minNumber,
      maxNumber: f.maxNumber,
      allowedSelections: f.allowedSelections,
      correctiveActionTrigger: f.correctiveActionTrigger,
      correctiveActionRequired: f.correctiveActionRequired,
    })),
    applicabilities: t.applicabilities.map((a) => ({
      kind: a.kind,
      assetId: a.assetId,
      assetType: a.assetType,
      spaceId: a.spaceId,
      spaceType: a.spaceType,
      unitId: a.unitId,
    })),
    schedules: t.schedules.map((s) => ({
      kind: s.kind,
      cycleStableKey: s.cycleStableKey,
      windowStartLocal: s.windowStartLocal,
      windowEndLocal: s.windowEndLocal,
    })),
  }));
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
        status: { not: "RETIRED" },
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
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDate: input.operationalDate,
      ...(input.unitId ? { unitId: input.unitId } : {}),
    },
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
  if (!isDietaryOperationalEvidenceEnabled()) {
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
