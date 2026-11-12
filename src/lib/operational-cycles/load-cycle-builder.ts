import type { FacilitySession } from "@/lib/auth";
import { loadDepartmentLocationsView } from "@/lib/department-administration/load-department-admin";
import { listFacilityRoomTypes } from "@/lib/facility-builder/facility-room-types";
import {
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { resolveCycleAuthority } from "./cycle-authority";
import {
  type CycleScopeLocationOption,
  type StandardRoomTypeOption,
} from "./cycle-scope";
import { mapCycleRow } from "./load-published-cycles";
import { CANONICAL_CYCLE_LOCATION_MODES } from "./effective-cycle-spaces";
import {
  describeOperationalCycleContext,
  resolveOperationalCycle,
} from "./resolve-operational-cycle";
import type { OperationalCycleDefinition } from "./types";

export type CycleBuilderRow = OperationalCycleDefinition & {
  publishedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CycleBuilderDayPreview = {
  operationalDateKey: string;
  context: ReturnType<typeof resolveOperationalCycle>;
  description: string;
  cycles: OperationalCycleDefinition[];
};

export type CycleBuilderCatalog = {
  locations: CycleScopeLocationOption[];
  /** Facility Room Types for Build room-picker filters (id + displayName). */
  roomTypes: StandardRoomTypeOption[];
};

export async function loadCycleScopeCatalog(input: {
  facilityId: string;
  departmentId: string;
}): Promise<CycleBuilderCatalog> {
  const locationsView = await loadDepartmentLocationsView({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  });
  const facilityRoomTypes = await listFacilityRoomTypes(input.facilityId, prisma);
  const facilityRoomTypeIds = new Set(facilityRoomTypes.map((row) => row.id));
  return {
    locations: (locationsView?.locations ?? []).filter((location) => location.isActive).map((location) => ({
      id: location.id,
      kind: location.kind,
      name: location.displayName || location.name,
      roomTypeKey: location.roomTypeKey,
      roomTypeLabel: location.roomTypeLabel,
      facilityRoomTypeId: location.roomTypeKey && facilityRoomTypeIds.has(location.roomTypeKey)
        ? location.roomTypeKey
        : null,
      neighborhoodId: location.parentNeighborhoodId,
      neighborhoodName: location.parentNeighborhoodName,
      hierarchyRole: location.hierarchyRole,
    })),
    roomTypes: facilityRoomTypes.filter((row) => row.isActive).map((row) => ({
      key: row.id,
      label: row.displayName,
    })),
  };

}

/**
 * List all cycles for Department Builder (draft / published / retired)
 * plus a day preview for a representative operational date.
 */
export async function loadCycleBuilder(input: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
  previewDateKey: string;
}): Promise<{
  cycles: CycleBuilderRow[];
  preview: CycleBuilderDayPreview;
  catalog: CycleBuilderCatalog;
  canManage: boolean;
  canPublish: boolean;
}> {
  const authority = await resolveCycleAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment) {
    throw new Error(authority.reason ?? "Insufficient Operational Cycle authority.");
  }

  const rows = await prisma.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      locationMode: { in: [...CANONICAL_CYCLE_LOCATION_MODES] },
    },
    include: {
      locations: { select: { unitId: true, spaceId: true } },
      milestoneTimes: { select: { unitId: true, milestone: true, configuredTime: true } },
      keyTimeGroups: {
        select: {
          dueLocal: true,
          rooms: { select: { spaceId: true } },
        },
        orderBy: { displaySequence: "asc" },
      },
    },
    orderBy: [{ displaySequence: "asc" }, { stableKey: "asc" }, { version: "desc" }],
  });

  const cycles: CycleBuilderRow[] = rows.map((row) => ({
    ...mapCycleRow(row),
    publishedAt: row.publishedAt,
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const publishedForPreview = cycles.filter((c) => {
    if (c.status !== "PUBLISHED") return false;
    const fromKey = toServiceDateKey(c.effectiveFrom);
    const toKey = c.effectiveTo ? toServiceDateKey(c.effectiveTo) : null;
    if (fromKey > input.previewDateKey) return false;
    if (toKey && toKey < input.previewDateKey) return false;
    return true;
  });

  const context = resolveOperationalCycle({
    cycles: publishedForPreview,
    now: new Date(`${input.previewDateKey}T12:00:00.000Z`),
    facilityTimezone: timezone,
    operationalDateKey: input.previewDateKey,
  });

  const catalog = await loadCycleScopeCatalog(input);

  return {
    cycles,
    preview: {
      operationalDateKey: input.previewDateKey,
      context,
      description: describeOperationalCycleContext(context),
      cycles: publishedForPreview,
    },
    catalog,
    canManage: authority.canManage,
    canPublish: authority.canPublish,
  };
}
