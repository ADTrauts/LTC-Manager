import { unstable_noStore as noStore } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { PartnerAssetDetailView } from "@/components/partner/partner-asset-detail";
import { loadPartnerAssetDetail } from "@/lib/asset-operations/load-partner-assets";
import { canPartner } from "@/lib/partner-user-access";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export default async function PartnerAssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  noStore();
  const context = await requirePartnerOperationalContext();
  if (!canPartner(context.effectiveRole, "assets.read")) redirect("/partner");
  const { assetId } = await params;
  const asset = await loadPartnerAssetDetail({
    client: prisma,
    facilityId: context.facilityId,
    departmentId: context.activeDepartmentId,
    assetId,
  });
  if (!asset) notFound();
  return <PartnerAssetDetailView asset={asset} />;
}
