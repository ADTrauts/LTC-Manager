import { TeamsWorkspace } from "@/app/(protected)/admin/departments/[departmentId]/teams-workspace";
import type { FacilitySession } from "@/lib/auth";
import { loadDepartmentPeopleOrganization } from "@/lib/department-administration/people-organization";
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
  facilityId,
  departmentId,
  departmentName,
  selectedTeamId,
}: Props) {
  const organization = await loadDepartmentPeopleOrganization(prisma, {
    facilityId,
    departmentId,
  });
  if (!organization) return null;

  const employeesHref = `/employees?dept=${encodeURIComponent(departmentId)}`;

  return (
    <TeamsWorkspace
      departmentName={departmentName}
      organization={organization}
      employeesHref={employeesHref}
      selectedTeamId={selectedTeamId}
    />
  );
}
