import { OperatingRhythmPanel } from "@/app/(protected)/admin/departments/[departmentId]/operating-rhythm-panel";
import { presentOperatingRhythmRoots } from "@/lib/department-administration/operating-rhythm";
import { hasDietaryDomainCapabilities } from "@/lib/department-admission";
import {
  cycleStarterWouldCreateCount,
  resolveCycleStarterForDepartmentProduct,
} from "@/lib/department-products/cycle-starter";
import { loadTeamCatalog } from "@/lib/department-teams";
import {
  isImmediatePublishTestingOverrideEnabled,
  nextOperationalDayKey,
  resolveCycleAuthority,
  type CycleLifecycleRow,
} from "@/lib/operational-cycles";
import { mapCycleRow } from "@/lib/operational-cycles/load-published-cycles";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import type { AppJwtPayload } from "@/lib/auth";

type Props = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentKey?: string;
};

export async function OperatingRhythmSection({
  session,
  facilityId,
  departmentId,
  departmentKey,
}: Props) {
  const timezone = await loadFacilityTimezone(prisma, facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
  const [cycleAuthority, catalog, cycleRows] = await Promise.all([
    resolveCycleAuthority(session, facilityId, departmentId),
    loadTeamCatalog({ facilityId, departmentId }),
    prisma.departmentOperationalCycle.findMany({
      where: { facilityId, departmentId },
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
    }),
  ]);
  const mapped: CycleLifecycleRow[] = cycleRows.map((row) => ({
    ...mapCycleRow(row),
    publishedAt: row.publishedAt,
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  const starter = resolveCycleStarterForDepartmentProduct(departmentKey);
  const existingKeys = new Set(cycleRows.map((row) => row.stableKey));

  return (
    <OperatingRhythmPanel
      departmentId={departmentId}
      starter={starter}
      starterWouldCreate={starter ? cycleStarterWouldCreateCount(starter.kind, existingKeys) : 0}
      roots={presentOperatingRhythmRoots(mapped, todayKey)}
      catalog={catalog}
      canManage={cycleAuthority.canManage}
      canPublish={cycleAuthority.canPublish}
      showMeal={hasDietaryDomainCapabilities(departmentKey)}
      nextDayKey={nextOperationalDayKey(todayKey)}
      allowImmediateTesting={isImmediatePublishTestingOverrideEnabled()}
    />
  );
}
