import type { PrismaClient } from "@prisma/client";
import { RepairTrade } from "@prisma/client";

const OP_KEYS = ["DIETARY", "EVS", "PLANT"] as const;

async function deptIdMap(prisma: PrismaClient, facilityId: string) {
  const rows = await prisma.department.findMany({
    where: { facilityId, isActive: true, key: { in: [...OP_KEYS] } },
    select: { id: true, key: true },
  });
  const m: Partial<Record<(typeof OP_KEYS)[number], string>> = {};
  for (const r of rows) {
    if (r.key === "DIETARY" || r.key === "EVS" || r.key === "PLANT") {
      m[r.key] = r.id;
    }
  }
  return m;
}

function unitPrimaryDepartmentId(
  responsibilities: Array<{ kind: string; department: { id: string; key: string } }>,
): string | null {
  const primary = responsibilities.find((r) => r.kind === "PRIMARY");
  return primary?.department.id ?? null;
}

/**
 * Suggests requesting / responsible departments when the form omits them.
 * Trade and asset department decide the responsible department.
 */
export async function suggestRepairDepartmentIds(
  prisma: PrismaClient,
  opts: {
    facilityId: string;
    unitId: string;
    assetId?: string | null;
    repairTrade: RepairTrade;
    sessionPrimaryDepartmentId?: string | null;
    forceRequestingDepartmentId?: string | null;
    explicitRequestingDepartmentId?: string | null;
    explicitResponsibleDepartmentId?: string | null;
  },
): Promise<{ requestingDepartmentId: string | null; responsibleDepartmentId: string | null }> {
  const dept = await deptIdMap(prisma, opts.facilityId);

  let requestingDepartmentId: string | null =
    opts.explicitRequestingDepartmentId?.trim() || null;

  let responsibleDepartmentId: string | null =
    opts.explicitResponsibleDepartmentId?.trim() || null;

  if (opts.forceRequestingDepartmentId) {
    requestingDepartmentId = opts.forceRequestingDepartmentId;
  }

  const unit = await prisma.unit.findFirst({
    where: { id: opts.unitId, facilityId: opts.facilityId },
    select: {
      departmentResponsibilities: {
        select: { kind: true, department: { select: { id: true, key: true } } },
      },
    },
  });

  let assetDeptId: string | null = null;
  if (opts.assetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: opts.assetId, unit: { facilityId: opts.facilityId } },
      select: { departmentId: true },
    });
    assetDeptId = asset?.departmentId ?? null;
  }

  const unitPrimaryDietary =
    unit?.departmentResponsibilities.find(
      (r) => r.kind === "PRIMARY" && r.department.key === "DIETARY",
    )?.department.id ?? null;

  const unitPrimaryAny = unit
    ? unitPrimaryDepartmentId(unit.departmentResponsibilities)
    : null;

  if (!requestingDepartmentId) {
    const pri = opts.sessionPrimaryDepartmentId;
    if (pri) {
      const ok = await prisma.department.findFirst({
        where: { id: pri, facilityId: opts.facilityId, isActive: true },
        select: { id: true },
      });
      if (ok) requestingDepartmentId = pri;
    }
    if (!requestingDepartmentId && unitPrimaryAny) {
      requestingDepartmentId = unitPrimaryAny;
    }
    if (!requestingDepartmentId && unitPrimaryDietary) {
      requestingDepartmentId = unitPrimaryDietary;
    }
    if (!requestingDepartmentId && dept.DIETARY) requestingDepartmentId = dept.DIETARY;
  }

  if (!responsibleDepartmentId) {
    if (
      opts.repairTrade === RepairTrade.PLUMBING ||
      opts.repairTrade === RepairTrade.ELECTRICAL
    ) {
      responsibleDepartmentId = dept.PLANT ?? dept.DIETARY ?? requestingDepartmentId;
    } else if (assetDeptId) {
      responsibleDepartmentId = assetDeptId;
    } else if (opts.repairTrade === RepairTrade.EQUIPMENT) {
      responsibleDepartmentId = dept.DIETARY ?? dept.PLANT ?? requestingDepartmentId;
    } else {
      responsibleDepartmentId = dept.PLANT ?? dept.DIETARY ?? requestingDepartmentId;
    }
  }

  return { requestingDepartmentId, responsibleDepartmentId };
}
