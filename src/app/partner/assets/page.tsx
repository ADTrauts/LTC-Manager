import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { PartnerAssetList } from "@/components/partner/partner-asset-list";
import { loadPartnerAssets } from "@/lib/asset-operations/load-partner-assets";
import { canPartner } from "@/lib/partner-user-access";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

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
  const assets = await loadPartnerAssets({
    client: prisma,
    facilityId: context.facilityId,
    departmentId: context.activeDepartmentId,
  });
  return <PartnerAssetList departmentName={departmentName} assets={assets} />;
}
