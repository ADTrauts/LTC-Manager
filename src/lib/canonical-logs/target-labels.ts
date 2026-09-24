/**
 * Human labels for Attachment targets (no raw IDs).
 */

import type { LogAttachmentTargetKind, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type ResolvedTargetLabel = {
  title: string;
  subtitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  suggestionContext: {
    kind: "ASSET" | "SPACE" | "UNIT" | "DEPARTMENT" | "FACILITY";
    equipmentType?: string | null;
    spaceType?: string | null;
    roomTypeHints?: string[];
    unitName?: string | null;
    departmentKey?: string | null;
  };
};

export async function resolveAttachmentTargetLabel(
  client: Db,
  input: {
    facilityId: string;
    targetKind: LogAttachmentTargetKind;
    assetId?: string | null;
    spaceId?: string | null;
    unitId?: string | null;
    targetDepartmentId?: string | null;
    operationalTypeKey?: string | null;
    departmentId?: string | null;
  },
): Promise<ResolvedTargetLabel | null> {
  switch (input.targetKind) {
    case "ASSET": {
      if (!input.assetId) return null;
      const asset = await client.asset.findFirst({
        where: { id: input.assetId, unit: { facilityId: input.facilityId } },
        select: {
          name: true,
          equipmentType: true,
          departmentId: true,
          department: { select: { id: true, name: true, key: true } },
          unit: { select: { name: true } },
          space: { select: { name: true } },
        },
      });
      if (!asset) return null;
      const location =
        asset.unit?.name && asset.space?.name
          ? `${asset.unit.name} → ${asset.space.name}`
          : asset.unit?.name ?? null;
      return {
        title: asset.name,
        subtitle: location,
        departmentId: asset.departmentId ?? asset.department?.id ?? null,
        departmentName: asset.department?.name ?? null,
        suggestionContext: {
          kind: "ASSET",
          equipmentType: asset.equipmentType,
          departmentKey: asset.department?.key ?? null,
        },
      };
    }
    case "SPACE": {
      if (!input.spaceId) return null;
      const space = await client.unitSpace.findFirst({
        where: { id: input.spaceId, facilityId: input.facilityId },
        select: {
          name: true,
          spaceType: true,
          unit: { select: { name: true } },
          facilityRoomType: { select: { baseTypeKey: true, displayName: true } },
          responsibilities: {
            take: 1,
            select: { department: { select: { id: true, name: true, key: true } } },
          },
        },
      });
      if (!space) return null;
      const dept = space.responsibilities[0]?.department ?? null;
      const roomHints = [
        space.facilityRoomType?.baseTypeKey,
        space.facilityRoomType?.displayName,
        space.name,
      ].filter((x): x is string => Boolean(x));
      return {
        title: space.unit?.name ? `${space.unit.name} → ${space.name}` : space.name,
        subtitle: null,
        departmentId: dept?.id ?? null,
        departmentName: dept?.name ?? null,
        suggestionContext: {
          kind: "SPACE",
          spaceType: space.spaceType,
          roomTypeHints: roomHints,
          departmentKey: dept?.key ?? null,
        },
      };
    }
    case "UNIT": {
      if (!input.unitId) return null;
      const unit = await client.unit.findFirst({
        where: { id: input.unitId, facilityId: input.facilityId },
        select: {
          name: true,
          departmentResponsibilities: {
            take: 1,
            select: { department: { select: { id: true, name: true, key: true } } },
          },
        },
      });
      if (!unit) return null;
      const dept = unit.departmentResponsibilities[0]?.department ?? null;
      return {
        title: unit.name,
        subtitle: dept?.name ?? null,
        departmentId: dept?.id ?? null,
        departmentName: dept?.name ?? null,
        suggestionContext: {
          kind: "UNIT",
          unitName: unit.name,
          departmentKey: dept?.key ?? null,
        },
      };
    }
    case "DEPARTMENT": {
      if (!input.targetDepartmentId) return null;
      const department = await client.department.findFirst({
        where: { id: input.targetDepartmentId, facilityId: input.facilityId },
        select: { id: true, name: true, key: true },
      });
      if (!department) return null;
      return {
        title: department.name,
        subtitle: null,
        departmentId: department.id,
        departmentName: department.name,
        suggestionContext: {
          kind: "DEPARTMENT",
          departmentKey: department.key,
        },
      };
    }
    case "FACILITY":
      return {
        title: "Facility",
        subtitle: null,
        departmentId: null,
        departmentName: null,
        suggestionContext: { kind: "FACILITY" },
      };
    case "OPERATIONAL_TYPE": {
      const key = input.operationalTypeKey?.trim();
      if (!key) return null;
      const archetype = await client.departmentRoomArchetype.findFirst({
        where: {
          key,
          profile: {
            facilityId: input.facilityId,
            ...(input.departmentId ? { departmentId: input.departmentId } : {}),
            status: { in: ["DRAFT", "CERTIFIED", "ACTIVE"] },
          },
        },
        orderBy: { profile: { version: "desc" } },
        select: {
          name: true,
          profile: { select: { departmentId: true, department: { select: { name: true } } } },
        },
      });
      const typeName = archetype?.name ?? key;
      return {
        title: `Operational Type: ${typeName}`,
        subtitle: archetype?.profile.department.name ?? null,
        departmentId: archetype?.profile.departmentId ?? input.departmentId ?? null,
        departmentName: archetype?.profile.department.name ?? null,
        suggestionContext: {
          kind: "DEPARTMENT",
          departmentKey: null,
        },
      };
    }
  }
}
