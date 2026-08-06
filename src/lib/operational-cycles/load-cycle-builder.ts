import type { AppJwtPayload } from "@/lib/auth";
import {
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { resolveCycleAuthority } from "./cycle-authority";
import { mapCycleRow } from "./load-published-cycles";
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

/**
 * List all cycles for Department Builder (draft / published / retired)
 * plus a day preview for a representative operational date.
 */
export async function loadCycleBuilder(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  previewDateKey: string;
}): Promise<{
  cycles: CycleBuilderRow[];
  preview: CycleBuilderDayPreview;
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
    },
    include: { locations: { select: { unitId: true } } },
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

  return {
    cycles,
    preview: {
      operationalDateKey: input.previewDateKey,
      context,
      description: describeOperationalCycleContext(context),
      cycles: publishedForPreview,
    },
    canManage: authority.canManage,
    canPublish: authority.canPublish,
  };
}
