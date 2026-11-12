import { prisma } from "@/lib/prisma";

import type { TemplateView } from "./template-types";

export async function loadTemplatesForDepartment(input: {
  facilityId: string;
  departmentId: string;
  departmentKey: string;
}): Promise<TemplateView[]> {
  const templates = await prisma.operationalAssignmentTemplate.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      status: true,
      effectiveFrom: true,
      effectiveTo: true,
      departmentId: true,
      department: { select: { key: true } },
      workShiftId: true,
      workShift: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          roleKey: true,
          roleLabel: true,
          spaceId: true,
          space: { select: { name: true, unitId: true } },
          unitId: true,
          unit: { select: { name: true } },
          startsAtLocal: true,
          endsAtLocal: true,
          requiredCount: true,
          sortOrder: true,
          notes: true,
        },
      },
    },
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    isActive: t.isActive,
    status: t.status,
    effectiveFrom: t.effectiveFrom ? t.effectiveFrom.toISOString().slice(0, 10) : null,
    effectiveTo: t.effectiveTo ? t.effectiveTo.toISOString().slice(0, 10) : null,
    departmentId: t.departmentId,
    departmentKey: t.department.key,
    operationDefinitionId: null,
    operationLabel: null,
    workShiftId: t.workShiftId,
    workShiftName: t.workShift?.name ?? null,
    items: t.items.map((item) => ({
      id: item.id,
      roleKey: item.roleKey,
      roleLabel: item.roleLabel,
      unitId: item.unitId,
      unitName: item.unit?.name ?? null,
      spaceId: item.spaceId, spaceName: item.space?.name ?? null, spaceUnitId: item.space?.unitId ?? null,
      startsAtLocal: item.startsAtLocal,
      endsAtLocal: item.endsAtLocal,
      requiredCount: item.requiredCount,
      sortOrder: item.sortOrder,
      notes: item.notes,
    })),
    totalPositions: t.items.reduce((sum, item) => sum + item.requiredCount, 0),
  }));
}
