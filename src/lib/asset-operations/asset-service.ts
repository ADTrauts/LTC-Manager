/**
 * Phase 10A Asset identity + operational status services.
 * Status changes are explicit only — Work Order completion never mutates Asset status here.
 */

import type {
  AssetCriticality,
  AssetStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  requireAssetManage,
  requireAssetStatusChange,
  resolveAssetOperationsAuthority,
} from "./authority";
import { loadAssetTimeline } from "./history";
import {
  type ChangeAssetStatusInput,
  isAssetAvailableForProspectiveUse,
  normalizeAssetStatus,
  OPEN_ASSET_ISSUE_STATUSES,
  OPEN_WORK_ORDER_STATUSES,
  type AssetOperationalStatus,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function toAssetStatus(status: AssetOperationalStatus): AssetStatus {
  return status as AssetStatus;
}

async function nextAssetCode(client: DbClient): Promise<string> {
  const count = await client.asset.count();
  let candidate = `A-${String(count + 1).padStart(5, "0")}`;
  for (let i = 0; i < 8; i += 1) {
    const clash = await client.asset.findFirst({
      where: { assetCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `A-${String(count + 1 + i + 1).padStart(5, "0")}`;
  }
  return `A-${cuidLike().slice(1, 9).toUpperCase()}`;
}

async function assertFacilityUnit(
  client: DbClient,
  unitId: string,
  facilityId: string,
) {
  const unit = await client.unit.findFirst({
    where: { id: unitId, facilityId },
    select: { id: true },
  });
  if (!unit) throw new Error("Unit not found.");
  return unit;
}

async function assertFacilityDepartment(
  client: DbClient,
  departmentId: string,
  facilityId: string,
) {
  const department = await client.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) throw new Error("Department not found.");
  return department;
}

async function loadScopedAsset(
  client: DbClient,
  assetId: string,
  facilityId: string,
) {
  const asset = await client.asset.findFirst({
    where: { id: assetId, unit: { facilityId } },
  });
  if (!asset) throw new Error("Asset not found.");
  return asset;
}

/**
 * Reject foreign-facility or retired Assets for prospective template binding.
 */
export function assertAssetEligibleForProspectiveTemplateBinding(asset: {
  status: AssetStatus | string;
  facilityId?: string | null;
  unitFacilityId?: string | null;
  expectedFacilityId: string;
}) {
  const facilityId = asset.facilityId ?? asset.unitFacilityId ?? null;
  if (facilityId && facilityId !== asset.expectedFacilityId) {
    throw new Error("Cross-facility Asset template binding denied.");
  }
  if (normalizeAssetStatus(asset.status) === "RETIRED") {
    throw new Error("Retired Assets cannot be bound to new templates.");
  }
  if (!isAssetAvailableForProspectiveUse(asset.status)) {
    throw new Error(
      "Only Operational or Degraded Assets may be bound prospectively to templates.",
    );
  }
}

export type CreateAssetInput = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  spaceId?: string | null;
  assetCode?: string | null;
  name: string;
  equipmentType: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  facilityAssetNumber?: string | null;
  description?: string | null;
  vendorId?: string | null;
  criticality?: AssetCriticality;
  notes?: string | null;
  procedureInstructions?: string | null;
  inServiceDate?: Date | null;
  warrantyExpiresAt?: Date | null;
  status?: AssetOperationalStatus;
};

export async function createAsset(
  session: AppJwtPayload,
  input: CreateAssetInput & { client?: DbClient },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireAssetManage(authority);

  await assertFacilityUnit(client, input.unitId, input.facilityId);
  await assertFacilityDepartment(client, input.departmentId, input.facilityId);

  if (input.spaceId) {
    const space = await client.unitSpace.findFirst({
      where: {
        id: input.spaceId,
        facilityId: input.facilityId,
        OR: [{ unitId: input.unitId }, { unitId: null }],
      },
      select: { id: true },
    });
    if (!space) throw new Error("Space not found.");
  }

  if (input.vendorId) {
    const vendor = await client.vendor.findFirst({
      where: { id: input.vendorId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!vendor) throw new Error("Vendor not found.");
  }

  const actorUserId = sessionUserIdForFk(session);
  const initialStatus = toAssetStatus(input.status ?? "OPERATIONAL");
  const assetCode = input.assetCode?.trim() || (await nextAssetCode(client));

  const created = await client.asset.create({
    data: {
      id: cuidLike(),
      assetCode,
      name: input.name.trim(),
      equipmentType: input.equipmentType.trim(),
      unitId: input.unitId,
      spaceId: input.spaceId ?? null,
      departmentId: input.departmentId,
      manufacturer: input.manufacturer?.trim() || null,
      model: input.model?.trim() || null,
      serialNumber: input.serialNumber?.trim() || null,
      facilityAssetNumber: input.facilityAssetNumber?.trim() || null,
      description: input.description?.trim() || null,
      vendorId: input.vendorId ?? null,
      status: initialStatus,
      criticality: input.criticality ?? "ROUTINE",
      notes: input.notes?.trim() || null,
      procedureInstructions: input.procedureInstructions?.trim() || null,
      inServiceDate: input.inServiceDate ?? null,
      warrantyExpiresAt: input.warrantyExpiresAt ?? null,
      createdByUserId: actorUserId,
      lastChangedByUserId: actorUserId,
      statusHistory: {
        create: {
          id: cuidLike(),
          fromStatus: null,
          toStatus: initialStatus,
          reason: "INITIAL",
          note: "Asset registered",
          changedByUserId: actorUserId,
        },
      },
    },
  });

  return created;
}

export type UpdateAssetIdentityInput = {
  facilityId: string;
  departmentId: string;
  assetId: string;
  name?: string;
  equipmentType?: string;
  spaceId?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  facilityAssetNumber?: string | null;
  description?: string | null;
  vendorId?: string | null;
  criticality?: AssetCriticality;
  notes?: string | null;
  procedureInstructions?: string | null;
  inServiceDate?: Date | null;
  warrantyExpiresAt?: Date | null;
  /** Relocate within the same facility only. */
  unitId?: string;
  departmentIdNext?: string | null;
};

export async function updateAssetIdentity(
  session: AppJwtPayload,
  input: UpdateAssetIdentityInput & { client?: DbClient },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireAssetManage(authority);

  const asset = await loadScopedAsset(client, input.assetId, input.facilityId);
  if (normalizeAssetStatus(asset.status) === "RETIRED") {
    throw new Error("Retired Assets cannot have identity updated. Preserve history.");
  }

  const nextUnitId = input.unitId ?? asset.unitId;
  if (nextUnitId !== asset.unitId) {
    await assertFacilityUnit(client, nextUnitId, input.facilityId);
  }

  const nextDepartmentId =
    input.departmentIdNext !== undefined
      ? input.departmentIdNext
      : asset.departmentId;
  if (nextDepartmentId) {
    await assertFacilityDepartment(client, nextDepartmentId, input.facilityId);
  }

  if (input.spaceId) {
    const space = await client.unitSpace.findFirst({
      where: {
        id: input.spaceId,
        facilityId: input.facilityId,
        OR: [{ unitId: nextUnitId }, { unitId: null }],
      },
      select: { id: true },
    });
    if (!space) throw new Error("Space not found.");
  }

  if (input.vendorId) {
    const vendor = await client.vendor.findFirst({
      where: { id: input.vendorId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!vendor) throw new Error("Vendor not found.");
  }

  const actorUserId = sessionUserIdForFk(session);
  const data: Prisma.AssetUpdateInput = {
    ...(actorUserId
      ? { lastChangedByUser: { connect: { id: actorUserId } } }
      : {}),
  };
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.equipmentType !== undefined) data.equipmentType = input.equipmentType.trim();
  if (input.unitId !== undefined) data.unit = { connect: { id: input.unitId } };
  if (input.spaceId !== undefined) {
    data.space = input.spaceId
      ? { connect: { id: input.spaceId } }
      : { disconnect: true };
  }
  if (input.departmentIdNext !== undefined) {
    data.department = input.departmentIdNext
      ? { connect: { id: input.departmentIdNext } }
      : { disconnect: true };
  }
  if (input.manufacturer !== undefined) {
    data.manufacturer = input.manufacturer?.trim() || null;
  }
  if (input.model !== undefined) data.model = input.model?.trim() || null;
  if (input.serialNumber !== undefined) {
    data.serialNumber = input.serialNumber?.trim() || null;
  }
  if (input.facilityAssetNumber !== undefined) {
    data.facilityAssetNumber = input.facilityAssetNumber?.trim() || null;
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.vendorId !== undefined) {
    data.vendor = input.vendorId
      ? { connect: { id: input.vendorId } }
      : { disconnect: true };
  }
  if (input.criticality !== undefined) data.criticality = input.criticality;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.procedureInstructions !== undefined) {
    data.procedureInstructions = input.procedureInstructions?.trim() || null;
  }
  if (input.inServiceDate !== undefined) data.inServiceDate = input.inServiceDate;
  if (input.warrantyExpiresAt !== undefined) {
    data.warrantyExpiresAt = input.warrantyExpiresAt;
  }

  return client.asset.update({
    where: { id: asset.id },
    data,
  });
}

export async function changeAssetStatus(
  session: AppJwtPayload,
  input: ChangeAssetStatusInput & {
    facilityId: string;
    departmentId: string;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireAssetStatusChange(authority);

  const asset = await loadScopedAsset(client, input.assetId, input.facilityId);
  const fromStatus = asset.status;
  const toStatus = toAssetStatus(input.toStatus);

  if (normalizeAssetStatus(fromStatus) === "RETIRED" && input.toStatus !== "RETIRED") {
    throw new Error("Retired Assets cannot return to service without a correction workflow.");
  }

  if (fromStatus === toStatus || (normalizeAssetStatus(fromStatus) === normalizeAssetStatus(toStatus) && fromStatus !== "ACTIVE")) {
    // ACTIVE → OPERATIONAL is a meaningful normalize write; otherwise no-op.
    if (!(fromStatus === "ACTIVE" && toStatus === "OPERATIONAL")) {
      return asset;
    }
  }

  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();
  const retired =
    input.toStatus === "RETIRED"
      ? {
          retiredAt: now,
          retiredReason: input.note?.trim() || "Retired",
        }
      : input.toStatus === "OPERATIONAL"
        ? { retiredAt: null, retiredReason: null }
        : {};

  const updated = await client.asset.update({
    where: { id: asset.id },
    data: {
      status: toStatus,
      ...(actorUserId
        ? { lastChangedByUser: { connect: { id: actorUserId } } }
        : {}),
      ...retired,
      statusHistory: {
        create: {
          id: cuidLike(),
          fromStatus,
          toStatus,
          reason: input.reason,
          note: input.note?.trim() || null,
          changedByUserId: actorUserId,
          sourceIssueId: input.sourceIssueId ?? null,
          sourceRepairId: input.sourceRepairId ?? null,
          changedAt: now,
        },
      },
    },
  });

  return updated;
}

/** Explicit return-to-service — never called automatically from Work Order complete. */
export async function returnAssetToService(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    assetId: string;
    note?: string | null;
    sourceIssueId?: string | null;
    sourceRepairId?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return changeAssetStatus(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    assetId: input.assetId,
    toStatus: "OPERATIONAL",
    reason: "RETURN_TO_SERVICE",
    note: input.note ?? "Returned to service",
    sourceIssueId: input.sourceIssueId,
    sourceRepairId: input.sourceRepairId,
    client: input.client,
    now: input.now,
  });
}

export async function retireAsset(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    assetId: string;
    reason?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  return changeAssetStatus(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    assetId: input.assetId,
    toStatus: "RETIRED",
    reason: "RETIREMENT",
    note: input.reason ?? "Asset retired",
    client: input.client,
    now: input.now,
  });
}

export async function listAssetsForFacility(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    unitId?: string | null;
    includeRetired?: boolean;
    /** When true, only Operational/Degraded Assets suitable for template binding. */
    prospectiveTemplateBinding?: boolean;
  },
) {
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewRuntime && !authority.canManageAssets) {
    throw new Error(authority.reason ?? "Asset list denied.");
  }

  const statusFilter: Prisma.AssetWhereInput = input.prospectiveTemplateBinding
    ? { status: { in: ["ACTIVE", "OPERATIONAL", "DEGRADED"] } }
    : input.includeRetired
      ? {}
      : { status: { not: "RETIRED" } };

  const rows = await prisma.asset.findMany({
    where: {
      unit: { facilityId: input.facilityId },
      ...(input.departmentId
        ? {
            OR: [{ departmentId: input.departmentId }, { departmentId: null }],
          }
        : {}),
      ...(input.unitId ? { unitId: input.unitId } : {}),
      ...statusFilter,
    },
    orderBy: [{ assetCode: "asc" }],
    select: {
      id: true,
      assetCode: true,
      name: true,
      equipmentType: true,
      status: true,
      criticality: true,
      unitId: true,
      departmentId: true,
      spaceId: true,
      manufacturer: true,
      model: true,
      serialNumber: true,
      facilityAssetNumber: true,
      vendorId: true,
      unit: { select: { id: true, name: true, facilityId: true } },
    },
  });

  if (input.prospectiveTemplateBinding) {
    for (const row of rows) {
      assertAssetEligibleForProspectiveTemplateBinding({
        status: row.status,
        unitFacilityId: row.unit.facilityId,
        expectedFacilityId: input.facilityId,
      });
    }
  }

  return rows.map((row) => ({
    ...row,
    operationalStatus: normalizeAssetStatus(row.status),
    availableForProspectiveUse: isAssetAvailableForProspectiveUse(row.status),
  }));
}

export async function getAssetProfile(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    assetId: string;
    historyLimit?: number;
    evidenceLimit?: number;
  },
) {
  const authority = await resolveAssetOperationsAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewRuntime && !authority.canManageAssets) {
    throw new Error(authority.reason ?? "Asset profile denied.");
  }

  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, unit: { facilityId: input.facilityId } },
    include: {
      unit: { select: { id: true, name: true, facilityId: true } },
      space: { select: { id: true, name: true, spaceType: true } },
      department: { select: { id: true, name: true, key: true } },
      vendor: authority.canViewVendorDetails
        ? {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              contactName: true,
            },
          }
        : { select: { id: true, name: true } },
    },
  });
  if (!asset) throw new Error("Asset not found.");

  const evidenceLimit = input.evidenceLimit ?? 10;
  const historyLimit = input.historyLimit ?? 40;

  const [templates, recentEvidence, openIssues, activeWorkOrders, history] =
    await Promise.all([
      prisma.operationalTemplateApplicability.findMany({
        where: {
          assetId: asset.id,
          template: {
            facilityId: input.facilityId,
            departmentId: input.departmentId,
            status: { in: ["PUBLISHED", "DRAFT"] },
          },
        },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              status: true,
              stableKey: true,
              version: true,
              purposeType: true,
            },
          },
        },
        take: 50,
      }),
      prisma.operationalEvidenceRecord.findMany({
        where: {
          assetId: asset.id,
          facilityId: input.facilityId,
        },
        orderBy: { occurredAt: "desc" },
        take: evidenceLimit,
        select: {
          id: true,
          templateName: true,
          status: true,
          outOfStandard: true,
          occurredAt: true,
          operationalDate: true,
          requirementKey: true,
        },
      }),
      prisma.assetIssue.findMany({
        where: {
          assetId: asset.id,
          facilityId: input.facilityId,
          status: { in: OPEN_ASSET_ISSUE_STATUSES },
        },
        orderBy: { reportedAt: "desc" },
        take: 25,
        select: {
          id: true,
          issueCode: true,
          summary: true,
          status: true,
          priority: true,
          operationalImpact: true,
          reportedAt: true,
          workOrderId: true,
        },
      }),
      prisma.repair.findMany({
        where: {
          assetId: asset.id,
          unit: { facilityId: input.facilityId },
          status: { in: OPEN_WORK_ORDER_STATUSES },
        },
        orderBy: { requestedAt: "desc" },
        take: 25,
        select: {
          id: true,
          repairCode: true,
          title: true,
          status: true,
          priority: true,
          returnToServiceReady: true,
          requestedAt: true,
          vendorId: true,
        },
      }),
      loadAssetTimeline(asset.id, { limit: historyLimit }),
    ]);

  const retired = normalizeAssetStatus(asset.status) === "RETIRED";
  const prospectiveTemplateBindingNote = retired
    ? "Retired Assets cannot be bound to new templates. History is preserved."
    : !isAssetAvailableForProspectiveUse(asset.status)
      ? "Out-of-service Assets are not eligible for prospective template binding."
      : asset.unit.facilityId !== input.facilityId
        ? "Cross-facility Asset template binding denied."
        : null;

  return {
    identity: {
      id: asset.id,
      assetCode: asset.assetCode,
      name: asset.name,
      equipmentType: asset.equipmentType,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serialNumber: asset.serialNumber,
      facilityAssetNumber: asset.facilityAssetNumber,
      description: asset.description,
      procedureInstructions: authority.canViewManagementNotes
        ? asset.procedureInstructions
        : null,
      notes: authority.canViewManagementNotes ? asset.notes : null,
      inServiceDate: asset.inServiceDate,
      warrantyExpiresAt: asset.warrantyExpiresAt,
      criticality: asset.criticality,
      unit: asset.unit,
      space: asset.space,
      department: asset.department,
      vendor: asset.vendor,
    },
    status: {
      raw: asset.status,
      operational: normalizeAssetStatus(asset.status),
      retiredAt: asset.retiredAt,
      retiredReason: asset.retiredReason,
    },
    templates: templates.map((t) => t.template),
    recentEvidence,
    openIssues,
    activeWorkOrders: activeWorkOrders.map((wo) => ({
      ...wo,
      vendorId: authority.canViewVendorDetails ? wo.vendorId : null,
    })),
    history,
    prospectiveTemplateBindingNote,
    availableForProspectiveUse: isAssetAvailableForProspectiveUse(asset.status),
  };
}
