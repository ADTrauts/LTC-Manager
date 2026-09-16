/**
 * Shared loader for BUILD target Logs pages and attach flow.
 */

import type { LogAttachmentTargetKind } from "@prisma/client";

import {
  catalogMatchesTarget,
  cycleLabelMap,
  listAttachmentsForTarget,
  listPublishedCatalogBrowseCards,
  loadCycleOptionsForDepartment,
  resolveAttachTimingProposal,
  resolveAttachmentTargetLabel,
  resolveDefaultAttachmentEffectiveFromKey,
} from "@/lib/canonical-logs";
import { loadFacilityTimezone } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

export async function loadTargetLogsBuildContext(input: {
  facilityId: string;
  targetKind: Exclude<LogAttachmentTargetKind, "FACILITY">;
  targetId: string;
  /** Override owning department when target resolution is ambiguous. */
  departmentId?: string | null;
}) {
  const target =
    input.targetKind === "ASSET"
      ? { targetKind: "ASSET" as const, assetId: input.targetId }
      : input.targetKind === "SPACE"
        ? { targetKind: "SPACE" as const, spaceId: input.targetId }
        : input.targetKind === "UNIT"
          ? { targetKind: "UNIT" as const, unitId: input.targetId }
          : {
              targetKind: "DEPARTMENT" as const,
              targetDepartmentId: input.targetId,
            };

  const label = await resolveAttachmentTargetLabel(prisma, {
    facilityId: input.facilityId,
    ...target,
  });
  if (!label) return null;

  const departmentId = input.departmentId ?? label.departmentId;
  if (!departmentId) {
    return {
      label,
      departmentId: null as string | null,
      departmentName: null as string | null,
      attachments: [],
      catalogCards: await listPublishedCatalogBrowseCards(prisma),
      suggestedStableKeys: [] as string[],
      cycleOptions: [],
      cycleLabelByKey: new Map<string, string>(),
      publishedCycleKeys: [] as string[],
      defaultTimingByStableKey: {} as Record<
        string,
        ReturnType<typeof resolveAttachTimingProposal>
      >,
      effective: resolveDefaultAttachmentEffectiveFromKey({
        facilityTimezone: await loadFacilityTimezone(prisma, input.facilityId),
      }),
      addHref: buildAddHref(input.targetKind, input.targetId),
    };
  }

  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId: input.facilityId },
    select: { id: true, name: true },
  });

  const cycleOptions = await loadCycleOptionsForDepartment(
    prisma,
    input.facilityId,
    departmentId,
  );
  const cycleLabelByKey = cycleLabelMap(cycleOptions);
  const publishedCycleKeys = cycleOptions.map((c) => c.stableKey);

  const attachments = await listAttachmentsForTarget(prisma, {
    facilityId: input.facilityId,
    targetKind: input.targetKind,
    assetId: input.targetKind === "ASSET" ? input.targetId : null,
    spaceId: input.targetKind === "SPACE" ? input.targetId : null,
    unitId: input.targetKind === "UNIT" ? input.targetId : null,
    targetDepartmentId: input.targetKind === "DEPARTMENT" ? input.targetId : null,
    cycleLabelByKey,
    publishedCycleStableKeys: publishedCycleKeys,
  });

  const catalogCards = await listPublishedCatalogBrowseCards(prisma);
  const suggestedStableKeys = catalogCards
    .filter((c) => catalogMatchesTarget(c.suggestions, label.suggestionContext))
    .map((c) => c.stableKey);

  const catalogRows = await prisma.catalogLogDefinition.findMany({
    where: {
      status: "PUBLISHED",
      stableKey: { in: catalogCards.map((c) => c.stableKey) },
    },
    orderBy: { version: "desc" },
    select: {
      stableKey: true,
      recommendedCadence: true,
      recommendedScheduleKind: true,
      recommendedDaypartLabels: true,
    },
  });
  const seen = new Set<string>();
  const defaultTimingByStableKey: Record<
    string,
    ReturnType<typeof resolveAttachTimingProposal>
  > = {};
  for (const row of catalogRows) {
    if (seen.has(row.stableKey)) continue;
    seen.add(row.stableKey);
    defaultTimingByStableKey[row.stableKey] = resolveAttachTimingProposal({
      recommendedCadence: row.recommendedCadence ?? "AD_HOC",
      recommendedScheduleKind: row.recommendedScheduleKind,
      recommendedDaypartLabels: row.recommendedDaypartLabels,
      publishedCycleStableKeys: publishedCycleKeys,
      cycleLabelByKey,
    });
  }

  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const effective = resolveDefaultAttachmentEffectiveFromKey({ facilityTimezone: timezone });

  return {
    label,
    departmentId: department?.id ?? departmentId,
    departmentName: department?.name ?? label.departmentName,
    attachments,
    catalogCards,
    suggestedStableKeys,
    cycleOptions,
    cycleLabelByKey,
    publishedCycleKeys,
    defaultTimingByStableKey,
    effective,
    addHref: buildAddHref(input.targetKind, input.targetId),
  };
}

export function buildAddHref(
  targetKind: Exclude<LogAttachmentTargetKind, "FACILITY">,
  targetId: string,
  catalogStableKey?: string,
): string {
  const params = new URLSearchParams({
    targetKind,
    targetId,
  });
  if (catalogStableKey) params.set("catalog", catalogStableKey);
  return `/build/logs/attach?${params.toString()}`;
}
