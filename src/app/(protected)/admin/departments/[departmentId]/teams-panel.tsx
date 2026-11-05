import { TeamsWorkspace } from "@/app/(protected)/admin/departments/[departmentId]/teams-workspace";
import type { FacilitySession } from "@/lib/auth";
import {
  loadTeamEmployeeOptions,
  loadTeamsForDepartment,
  resolveTeamAuthority,
} from "@/lib/department-teams";
import { prisma } from "@/lib/prisma";

type Props = {
  session: FacilitySession;
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
  selectedTeamId,
}: Props) {
  const [authority, teams, employees] = await Promise.all([
    resolveTeamAuthority(session, facilityId, departmentId),
    loadTeamsForDepartment(prisma, { facilityId, departmentId }),
    loadTeamEmployeeOptions(prisma, { facilityId, departmentId }),
  ]);

  return (
    <TeamsWorkspace
      departmentId={departmentId}
      departmentName={departmentName}
      teams={teams}
      employees={employees}
      canManage={authority.canManage}
      selectedTeamId={selectedTeamId}
    />
  );
}
