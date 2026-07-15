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
      departmentId: true,
      department: { select: { key: true } },
      operationDefinitionId: true,
      operationDefinition: { select: { label: true } },
      workShiftId: true,
      workShift: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          roleKey: true,
          roleLabel: true,
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
    departmentId: t.departmentId,
    departmentKey: t.department.key,
    operationDefinitionId: t.operationDefinitionId,
    operationLabel: t.operationDefinition?.label ?? null,
    workShiftId: t.workShiftId,
    workShiftName: t.workShift?.name ?? null,
    items: t.items.map((item) => ({
      id: item.id,
      roleKey: item.roleKey,
      roleLabel: item.roleLabel,
      unitId: item.unitId,
      unitName: item.unit?.name ?? null,
      startsAtLocal: item.startsAtLocal,
      endsAtLocal: item.endsAtLocal,
      requiredCount: item.requiredCount,
      sortOrder: item.sortOrder,
      notes: item.notes,
    })),
    totalPositions: t.items.reduce((sum, item) => sum + item.requiredCount, 0),
  }));
}
