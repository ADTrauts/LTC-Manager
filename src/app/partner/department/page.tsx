import Link from "next/link";
import { redirect } from "next/navigation";

import { VendorFormPanel } from "@/app/partner/department/form-panel";
import { getPartnerFacilitySession } from "@/lib/auth";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { listVendorDepartmentPeople } from "@/lib/department-authority/vendor-workforce";
import { requirePartnerOperationalContext, loadPartnerFacilityShell } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export default async function PartnerDepartmentPage() {
  const session = await getPartnerFacilitySession();
  if (!session) redirect("/login");
  const context = await requirePartnerOperationalContext();
  const access = await resolveDepartmentAccess(prisma, session, {
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  });
  if (!access || (access.mode !== "MANAGE" && access.mode !== "VIEW")) redirect("/partner");

  const shell = await loadPartnerFacilityShell();
  const department = shell.departments.find((row) => row.id === context.activeDepartmentId);
  const people = await listVendorDepartmentPeople(prisma, {
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  });
  const maySetUp = partnerMaySetUpDepartment({
    mode: access.mode,
    isHead: access.isHead,
    effectiveRole: context.effectiveRole,
  });
  const forms =
    maySetUp && isContractedDepartmentAuthorityEnabled()
      ? await prisma.catalogLogDefinition.findMany({
          where: {
            ownerKind: "ORGANIZATION",
            ownerOrganizationId: session.partnerOrganizationId,
          },
          select: { id: true, name: true, status: true },
          orderBy: { name: "asc" },
        })
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="vendor-department-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{department?.name ?? "Department"}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {access.isHead
            ? "You run this Department. Changes are yours. The facility sees the summary and compliance Records."
            : "You can view this Department."}
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        <li>
          <Link href="/partner/logs" className="underline-offset-2 hover:underline">
            Logs
          </Link>
        </li>
        <li>
          <Link href="/partner/locations" className="underline-offset-2 hover:underline">
            Locations
          </Link>
        </li>
        {access.isHead ? (
          <li>
            <Link href="/partner/people" className="underline-offset-2 hover:underline">
              People ({people.length})
            </Link>
          </li>
        ) : null}
      </ul>
      {maySetUp && isContractedDepartmentAuthorityEnabled() ? <VendorFormPanel drafts={forms} /> : null}
    </div>
  );
}
