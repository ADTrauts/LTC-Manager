import { TeamsWorkspace } from "@/app/(protected)/admin/departments/[departmentId]/teams-workspace";
import type { AppJwtPayload } from "@/lib/auth";
import { presentOperatingRhythmRoots } from "@/lib/department-administration/operating-rhythm";
import { hasDietaryDomainCapabilities } from "@/lib/department-admission";
import {
  cycleStarterWouldCreateCount,
  resolveCycleStarterForDepartmentProduct,
} from "@/lib/department-products/cycle-starter";
import {
  loadDepartmentRootCycleOptions,
  loadTeamCatalog,
  loadTeamEmployeeOptions,
  loadTeamsForDepartment,
  resolveTeamAuthority,
} from "@/lib/department-teams";
import {
  isImmediatePublishTestingOverrideEnabled,
  nextOperationalDayKey,
  resolveCycleAuthority,
  type CycleLifecycleRow,
} from "@/lib/operational-cycles";
import { mapCycleRow } from "@/lib/operational-cycles/load-published-cycles";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

type Props = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentName: string;
  departmentKey?: string;
  selectedTeamId: string | null;
};

export async function TeamsPanel({
  session,
  facilityId,
  departmentId,
  departmentName,
  departmentKey,
  selectedTeamId,
}: Props) {
  const timezone = await loadFacilityTimezone(prisma, facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
  const [
    authority,
    cycleAuthority,
    teams,
    catalog,
    employees,
    cycleOptions,
    cycleRows,
  ] = await Promise.all([
    resolveTeamAuthority(session, facilityId, departmentId),
    resolveCycleAuthority(session, facilityId, departmentId),
    loadTeamsForDepartment(prisma, { facilityId, departmentId }),
    loadTeamCatalog({ facilityId, departmentId }),
    loadTeamEmployeeOptions(prisma, { facilityId, departmentId }),
    loadDepartmentRootCycleOptions(prisma, { facilityId, departmentId }),
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
    <TeamsWorkspace
      departmentId={departmentId}
      departmentName={departmentName}
      teams={teams}
      catalog={catalog}
      employees={employees}
      canManage={authority.canManage}
      canManageCycles={cycleAuthority.canManage}
      canPublishCycles={cycleAuthority.canPublish}
      selectedTeamId={selectedTeamId}
      cycleOptions={cycleOptions}
      showMeal={hasDietaryDomainCapabilities(departmentKey)}
      nextDayKey={nextOperationalDayKey(todayKey)}
      cycleStarter={starter}
      starterWouldCreate={starter ? cycleStarterWouldCreateCount(starter.kind, existingKeys) : 0}
      rhythmRoots={presentOperatingRhythmRoots(mapped, todayKey)}
      allowImmediateTesting={isImmediatePublishTestingOverrideEnabled()}
    />
  );
}
