/**
 * Phase 10A runtime Asset projections for Employee Runtime and Supervisor Board.
 * Employee view is intentionally concise — no vendor cost, management notes, or
 * other employees' report details beyond "open issue already reported".
 */

import { prisma } from "@/lib/prisma";

import {
  assetIssueStatusLabel,
  assetStatusLabel,
  normalizeAssetStatus,
  OPEN_ASSET_ISSUE_STATUSES,
  OPEN_WORK_ORDER_STATUSES,
  operationalImpactLabel,
  workOrderStatusLabel,
} from "./types";

export type UnitRuntimeAssetItem = {
  assetId: string;
  assetCode: string;
  name: string;
  equipmentType: string;
  status: string;
  statusLabel: string;
  criticality: string;
  openIssueAlreadyReported: boolean;
  openIssueCount: number;
  activeWorkOrderCount: number;
  /** Neutral impact label when an open unavailable issue exists — no reporter PII. */
  openImpactLabel: string | null;
};

export type LoadUnitRuntimeAssetsOptions = {
  departmentId?: string | null;
  includeRetired?: boolean;
};

export async function loadUnitRuntimeAssets(
  unitId: string,
  facilityId: string,
  options: LoadUnitRuntimeAssetsOptions = {},
): Promise<UnitRuntimeAssetItem[]> {
  const assets = await prisma.asset.findMany({
    where: {
      unitId,
      unit: { facilityId },
      ...(options.includeRetired ? {} : { status: { not: "RETIRED" } }),
      ...(options.departmentId
        ? {
            OR: [{ departmentId: options.departmentId }, { departmentId: null }],
          }
        : {}),
    },
    orderBy: [{ criticality: "asc" }, { assetCode: "asc" }],
    select: {
      id: true,
      assetCode: true,
      name: true,
      equipmentType: true,
      status: true,
      criticality: true,
    },
  });

  if (assets.length === 0) return [];

  const assetIds = assets.map((a) => a.id);

  const [openIssues, openWorkOrders] = await Promise.all([
    prisma.assetIssue.groupBy({
      by: ["assetId"],
      where: {
        facilityId,
        assetId: { in: assetIds },
        status: { in: OPEN_ASSET_ISSUE_STATUSES },
      },
      _count: { _all: true },
    }),
    prisma.repair.groupBy({
      by: ["assetId"],
      where: {
        assetId: { in: assetIds },
        unit: { facilityId },
        status: { in: OPEN_WORK_ORDER_STATUSES },
      },
      _count: { _all: true },
    }),
  ]);

  const issueCountByAsset = new Map(
    openIssues.map((r) => [r.assetId, r._count._all] as const),
  );
  const woCountByAsset = new Map(
    openWorkOrders
      .filter((r): r is typeof r & { assetId: string } => Boolean(r.assetId))
      .map((r) => [r.assetId, r._count._all] as const),
  );

  const unavailable = await prisma.assetIssue.findMany({
    where: {
      facilityId,
      assetId: { in: assetIds },
      status: { in: OPEN_ASSET_ISSUE_STATUSES },
      operationalImpact: "EQUIPMENT_UNAVAILABLE",
    },
    select: { assetId: true, operationalImpact: true },
    distinct: ["assetId"],
  });
  const impactByAsset = new Map(
    unavailable.map((r) => [r.assetId, operationalImpactLabel(r.operationalImpact)] as const),
  );

  return assets.map((asset) => {
    const openIssueCount = issueCountByAsset.get(asset.id) ?? 0;
    return {
      assetId: asset.id,
      assetCode: asset.assetCode,
      name: asset.name,
      equipmentType: asset.equipmentType,
      status: normalizeAssetStatus(asset.status),
      statusLabel: assetStatusLabel(asset.status),
      criticality: asset.criticality,
      openIssueAlreadyReported: openIssueCount > 0,
      openIssueCount,
      activeWorkOrderCount: woCountByAsset.get(asset.id) ?? 0,
      openImpactLabel: impactByAsset.get(asset.id) ?? null,
    };
  });
}

export type SupervisorAssetExceptionItem = {
  group: "Asset" | "Equipment";
  status: string;
  temporal: "Current" | "Late" | "NotConfirmed";
  unitId: string | null;
  unitName: string | null;
  sourceHref: string;
  availableActions: string[];
  sortRank: number;
  assetId?: string;
  issueId?: string;
  workOrderId?: string;
};

/**
 * Exception projection for Supervisor Operations Board (derived only).
 */
export async function loadSupervisorAssetExceptions(
  facilityId: string,
  departmentId: string,
): Promise<SupervisorAssetExceptionItem[]> {
  const [openIssues, outOfServiceAssets, openWorkOrders] = await Promise.all([
    prisma.assetIssue.findMany({
      where: {
        facilityId,
        departmentId,
        status: { in: OPEN_ASSET_ISSUE_STATUSES },
      },
      orderBy: [{ priority: "desc" }, { reportedAt: "asc" }],
      take: 50,
      select: {
        id: true,
        issueCode: true,
        summary: true,
        status: true,
        operationalImpact: true,
        unitId: true,
        assetId: true,
        workOrderId: true,
        unit: { select: { name: true } },
        asset: { select: { assetCode: true, name: true, status: true } },
      },
    }),
    prisma.asset.findMany({
      where: {
        unit: { facilityId },
        OR: [{ departmentId }, { departmentId: null }],
        status: { in: ["OUT_OF_SERVICE", "DEGRADED"] },
      },
      take: 40,
      select: {
        id: true,
        assetCode: true,
        name: true,
        status: true,
        unitId: true,
        unit: { select: { name: true } },
      },
    }),
    prisma.repair.findMany({
      where: {
        unit: { facilityId },
        OR: [
          { requestingDepartmentId: departmentId },
          { responsibleDepartmentId: departmentId },
        ],
        status: { in: OPEN_WORK_ORDER_STATUSES },
        assetId: { not: null },
      },
      orderBy: { requestedAt: "asc" },
      take: 40,
      select: {
        id: true,
        repairCode: true,
        title: true,
        status: true,
        returnToServiceReady: true,
        unitId: true,
        assetId: true,
        unit: { select: { name: true } },
        asset: { select: { assetCode: true, name: true } },
      },
    }),
  ]);

  const items: SupervisorAssetExceptionItem[] = [];

  for (const issue of openIssues) {
    const temporal =
      issue.operationalImpact === "EQUIPMENT_UNAVAILABLE" ||
      issue.operationalImpact === "SERVICE_AT_RISK"
        ? "Late"
        : issue.status === "REPORTED"
          ? "NotConfirmed"
          : "Current";
    const sortRank =
      temporal === "Late" ? 470 : temporal === "Current" ? 480 : 490;
    items.push({
      group: "Asset",
      status: `${assetIssueStatusLabel(issue.status)} · ${issue.asset.assetCode}`,
      temporal,
      unitId: issue.unitId,
      unitName: issue.unit.name,
      sourceHref: `/asset-issues/${issue.id}`,
      availableActions: issue.workOrderId
        ? ["Open Asset Issue", "Open Work Order"]
        : ["Open Asset Issue", "Create Work Order"],
      sortRank,
      assetId: issue.assetId,
      issueId: issue.id,
      workOrderId: issue.workOrderId ?? undefined,
    });
  }

  const issueAssetIds = new Set(openIssues.map((i) => i.assetId));
  for (const asset of outOfServiceAssets) {
    if (issueAssetIds.has(asset.id)) continue;
    items.push({
      group: "Equipment",
      status: `${assetStatusLabel(asset.status)} · ${asset.assetCode}`,
      temporal: normalizeAssetStatus(asset.status) === "OUT_OF_SERVICE" ? "Late" : "Current",
      unitId: asset.unitId,
      unitName: asset.unit.name,
      sourceHref: `/assets/${asset.id}`,
      availableActions: ["Open Asset"],
      sortRank: normalizeAssetStatus(asset.status) === "OUT_OF_SERVICE" ? 475 : 485,
      assetId: asset.id,
    });
  }

  for (const wo of openWorkOrders) {
    items.push({
      group: "Asset",
      status: `${workOrderStatusLabel(wo.status)} · ${wo.repairCode}`,
      temporal: wo.returnToServiceReady ? "Current" : "NotConfirmed",
      unitId: wo.unitId,
      unitName: wo.unit.name,
      sourceHref: `/issues/${wo.id}`,
      availableActions: ["Open Work Order"],
      sortRank: wo.returnToServiceReady ? 482 : 492,
      assetId: wo.assetId ?? undefined,
      workOrderId: wo.id,
    });
  }

  items.sort(
    (a, b) =>
      a.sortRank - b.sortRank ||
      (a.unitName ?? "").localeCompare(b.unitName ?? ""),
  );

  return items;
}
