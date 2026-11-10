import { EmployeeTeamsPanel } from "@/components/employee-teams-panel";
import type { FacilitySession } from "@/lib/auth";
import {
  loadTeamEmployeeOptions,
  loadTeamCatalog,
  loadTeamsForDepartment,
  resolveTeamAuthority,
} from "@/lib/department-teams";
import { prisma } from "@/lib/prisma";

type Props = {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
  departmentName: string;
};

export async function DepartmentTeamsSection({
  session,
  facilityId,
  departmentId,
  departmentName,
}: Props) {
  const [authority, teams, employees, catalog] = await Promise.all([
    resolveTeamAuthority(session, facilityId, departmentId),
    loadTeamsForDepartment(prisma, { facilityId, departmentId }),
    loadTeamEmployeeOptions(prisma, { facilityId, departmentId }),
    loadTeamCatalog({ facilityId, departmentId }),
  ]);
  if (!authority.canView) return null;

  return (
    <EmployeeTeamsPanel
      departmentId={departmentId}
      departmentName={departmentName}
      teams={teams}
      employees={employees}
      canManage={authority.canManage}
      catalog={catalog}
    />
  );
}
