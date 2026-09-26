import { TeamsWorkspace } from "@/app/(protected)/admin/departments/[departmentId]/teams-workspace";
import type { AppJwtPayload } from "@/lib/auth";
import {
  loadDepartmentRootCycleOptions,
  loadTeamCatalog,
  loadTeamEmployeeOptions,
  loadTeamsForDepartment,
  resolveTeamAuthority,
} from "@/lib/department-teams";
import { nextOperationalDayKey } from "@/lib/operational-cycles";
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
  const [authority, teams, catalog, employees, cycleOptions] = await Promise.all([
    resolveTeamAuthority(session, facilityId, departmentId),
    loadTeamsForDepartment(prisma, { facilityId, departmentId }),
    loadTeamCatalog({ facilityId, departmentId }),
    loadTeamEmployeeOptions(prisma, { facilityId, departmentId }),
    loadDepartmentRootCycleOptions(prisma, { facilityId, departmentId }),
  ]);

  return (
    <TeamsWorkspace
      departmentId={departmentId}
      departmentName={departmentName}
      teams={teams}
      catalog={catalog}
      employees={employees}
      canManage={authority.canManage}
      selectedTeamId={selectedTeamId}
      cycleOptions={cycleOptions}
      showMeal={departmentKey === "DIETARY"}
      nextDayKey={nextOperationalDayKey(todayKey)}
    />
  );
}
