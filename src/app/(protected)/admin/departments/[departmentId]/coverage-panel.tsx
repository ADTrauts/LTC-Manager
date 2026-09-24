import { CoverageWorkspace } from "@/app/(protected)/admin/departments/[departmentId]/coverage-workspace";
import type { AppJwtPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  loadCoverageCatalog,
  loadWorkingCoverageExpectations,
  resolveCoverageAuthority,
} from "@/lib/scheduling/coverage-expectations";

type Props = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentName: string;
  departmentKey: string;
  selectedExpectationId: string | null;
};

export async function CoveragePanel({
  session,
  facilityId,
  departmentId,
  departmentName,
  departmentKey,
  selectedExpectationId,
}: Props) {
  const [authority, expectations, catalog] = await Promise.all([
    resolveCoverageAuthority(session, facilityId, departmentId),
    loadWorkingCoverageExpectations(prisma, { facilityId, departmentId }),
    loadCoverageCatalog({ facilityId, departmentId, departmentKey }),
  ]);

  return (
    <CoverageWorkspace
      departmentId={departmentId}
      departmentName={departmentName}
      expectations={expectations}
      catalog={catalog}
      canManage={authority.canManage}
      selectedExpectationId={selectedExpectationId}
    />
  );
}
