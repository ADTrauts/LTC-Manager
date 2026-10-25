import type { FacilitySession } from "@/lib/auth";
import { mayAuthorFacilityCatalogForm } from "@/lib/department-authority/catalog-forms";
import { resolveDepartmentAccessMap } from "@/lib/department-authority/resolve";
import { resolveDepartmentStaffManagerIds } from "@/lib/department-authority/staff-managers";
import { prisma } from "@/lib/prisma";

import { FacilityFormPanel } from "./facility-form-panel";

export async function FacilityFormsSection({
  session,
  facilityId,
  departmentId,
}: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
}) {
  const access = await resolveDepartmentAccessMap(prisma, session, {
    facilityId,
    departmentIds: [departmentId],
  });
  const item = access.get(departmentId);
  const employeeId =
    session.authKind === "employee"
      ? session.uid
      : (
          await prisma.employee.findFirst({
            where: { userId: session.uid, facilityId },
            select: { id: true },
          })
        )?.id ?? null;
  const allowed = await resolveDepartmentStaffManagerIds(prisma, { facilityId, departmentId });
  if (
    !mayAuthorFacilityCatalogForm({
      mode: item?.mode,
      operatingModel: item?.operatingModel,
      isHead: item?.isHead === true,
      isAllowedManager: employeeId != null && allowed.includes(employeeId),
    })
  ) {
    return null;
  }

  const forms = await prisma.catalogLogDefinition.findMany({
    where: {
      ownerKind: "FACILITY",
      ownerFacilityId: facilityId,
      operatorPeriodId: item?.operatorPeriodId ?? null,
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: { id: true, name: true, status: true },
  });

  return <FacilityFormPanel departmentId={departmentId} drafts={forms} />;
}
