import { TeamsWorkspace } from "@/app/(protected)/admin/departments/[departmentId]/teams-workspace";
import type { AppJwtPayload } from "@/lib/auth";
import {
  loadTeamCatalog,
  loadTeamEmployeeOptions,
  loadTeamsForDepartment,
  resolveTeamAuthority,
} from "@/lib/department-teams";
import { prisma } from "@/lib/prisma";

type Props = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentName: string;
  selectedTeamId: string | null;
};

export async function TeamsPanel({
  session,
  facilityId,
  departmentId,
  departmentName,
  selectedTeamId,
}: Props) {
  const [authority, teams, catalog, employees] = await Promise.all([
    resolveTeamAuthority(session, facilityId, departmentId),
    loadTeamsForDepartment(prisma, { facilityId, departmentId }),
    loadTeamCatalog({ facilityId, departmentId }),
    loadTeamEmployeeOptions(prisma, { facilityId, departmentId }),
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
    />
  );
}
