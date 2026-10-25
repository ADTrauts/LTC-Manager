import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { PartnerAssetList } from "@/components/partner/partner-asset-list";
import { loadPartnerAssets } from "@/lib/asset-operations/load-partner-assets";
import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { canPartner } from "@/lib/partner-user-access";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

import { PartnerAssetForm } from "./add-form";

export default async function PartnerAssetsPage() {
  noStore();
  const context = await requirePartnerOperationalContext();
  if (!canPartner(context.effectiveRole, "assets.read")) redirect("/partner");
  const departmentName =
    (
      await prisma.department.findFirst({
        where: {
          id: context.activeDepartmentId,
          facilityId: context.facilityId,
          isActive: true,
        },
        select: { name: true },
      })
    )?.name ?? "Department";
  const session = await getPartnerFacilitySession();
  const access = session
    ? await resolveDepartmentAccess(prisma, session, {
        facilityId: context.facilityId,
        departmentId: context.activeDepartmentId,
      })
    : null;
  const mayAdd =
    isContractedDepartmentAuthorityEnabled() &&
    access != null &&
    partnerMaySetUpDepartment({
      mode: access.mode,
      isHead: access.isHead,
      effectiveRole: context.effectiveRole,
    });
  const [assets, places, maintainers, vendors] = await Promise.all([
    loadPartnerAssets({
      client: prisma,
      facilityId: context.facilityId,
      departmentId: context.activeDepartmentId,
    }),
    mayAdd
      ? prisma.unit.findMany({
          where: {
            facilityId: context.facilityId,
            departmentResponsibilities: { some: { departmentId: context.activeDepartmentId } },
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    mayAdd
      ? prisma.facilityOrganization.findMany({
          where: { facilityId: context.facilityId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    mayAdd
      ? prisma.vendor.findMany({
          where: { facilityId: context.facilityId },
          select: { id: true, name: true, ownerOrganizationId: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {mayAdd ? <PartnerAssetForm places={places} maintainers={maintainers} vendors={vendors} /> : null}
      <PartnerAssetList departmentName={departmentName} assets={assets} />
    </div>
  );
}
