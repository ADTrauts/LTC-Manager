import type { Prisma, PrismaClient } from "@prisma/client";

import { getRolesForDepartment } from "@/lib/scheduling/assignment-roles";
import { loadDepartmentOperationalTypeOptions } from "@/lib/operational-cycles/load-operational-type-targets";
import { toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { selectWorkingCoverageTemplates, type CoverageTemplateVersionRow } from "./publication";
import type { CoverageCatalog, CoverageExpectationView } from "./views";

type DbClient = PrismaClient | Prisma.TransactionClient;

const TEMPLATE_SELECT = {
  id: true,
  stableKey: true,
  version: true,
  status: true,
  name: true,
  description: true,
  isActive: true,
  effectiveFrom: true,
  effectiveTo: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      roleKey: true,
      roleLabel: true,
      requiredCount: true,
      applicableOperationalTypeKeys: true,
      applicableOperationalCycleStableKeys: true,
      unitId: true,
      unit: { select: { name: true } },
    },
  },
} as const;

function dateKey(value: Date | null): string | null {
  return value ? toServiceDateKey(value) : null;
}

export function toCoverageExpectationView(row: {
  id: string;
  stableKey: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  name: string;
  description: string | null;
  isActive: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  items: Array<{
    id: string;
    roleKey: string;
    roleLabel: string;
    requiredCount: number;
    applicableOperationalTypeKeys: string[];
    applicableOperationalCycleStableKeys: string[];
    unitId: string | null;
    unit: { name: string } | null;
  }>;
}): CoverageExpectationView {
  return {
    id: row.id,
    stableKey: row.stableKey,
    version: row.version,
    status: row.status,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    effectiveFrom: dateKey(row.effectiveFrom),
    effectiveTo: dateKey(row.effectiveTo),
    items: row.items.map((item) => ({
      id: item.id,
      roleKey: item.roleKey,
      roleLabel: item.roleLabel,
      requiredCount: item.requiredCount,
      applicableOperationalTypeKeys: item.applicableOperationalTypeKeys,
      applicableOperationalCycleStableKeys: item.applicableOperationalCycleStableKeys,
      unitId: item.unitId,
      unitName: item.unit?.name ?? null,
    })),
  };
}

export async function loadCoverageTemplatesRaw(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
) {
  return client.operationalAssignmentTemplate.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    select: TEMPLATE_SELECT,
    orderBy: [{ name: "asc" }, { version: "desc" }],
  });
}

export async function loadWorkingCoverageExpectations(
  client: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<CoverageExpectationView[]> {
  const rows = await loadCoverageTemplatesRaw(client, input);
  const working = selectWorkingCoverageTemplates(
    rows.map((row) => ({
      ...row,
      items: row.items,
    })) as CoverageTemplateVersionRow[],
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return working
    .map((row) => byId.get(row.id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map(toCoverageExpectationView);
}

export async function loadCoverageCatalog(input: {
  facilityId: string;
  departmentId: string;
  departmentKey: string;
}): Promise<CoverageCatalog> {
  const [operationalTypes, cycleRows] = await Promise.all([
    loadDepartmentOperationalTypeOptions({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      perspective: "working",
    }),
    loadCoverageCycleOptions(input),
  ]);

  return {
    roles: getRolesForDepartment(input.departmentKey).map((role) => ({
      key: role.key,
      label: role.label,
    })),
    operationalTypes,
    cycles: cycleRows,
  };
}

async function loadCoverageCycleOptions(input: {
  facilityId: string;
  departmentId: string;
}): Promise<Array<{ stableKey: string; label: string }>> {
  const rows = await prisma.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: { in: ["DRAFT", "PUBLISHED"] },
      nodeKind: "PERIOD",
    },
    select: { stableKey: true, label: true, status: true, version: true, displaySequence: true },
    orderBy: [{ displaySequence: "asc" }, { version: "desc" }],
  });
  const seen = new Set<string>();
  const out: Array<{ stableKey: string; label: string }> = [];
  const drafts = rows.filter((row) => row.status === "DRAFT");
  const published = rows.filter((row) => row.status === "PUBLISHED");
  for (const row of [...drafts, ...published]) {
    if (seen.has(row.stableKey)) continue;
    seen.add(row.stableKey);
    out.push({ stableKey: row.stableKey, label: row.label });
  }
  return out;
}
