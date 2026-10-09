import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { PartnerLocations } from "@/components/partner/partner-locations";
import { loadPartnerLocationProjection } from "@/lib/locations/load-partner-locations";
import { canPartner } from "@/lib/partner-user-access";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export default async function PartnerLocationsPage() {
  noStore();
  const context = await requirePartnerOperationalContext();
  if (!canPartner(context.effectiveRole, "locations.read")) redirect("/partner");
  const projection = await loadPartnerLocationProjection({
    client: prisma,
    facilityId: context.facilityId,
    departmentId: context.activeDepartmentId,
  });
  return <PartnerLocations departmentName={projection.departmentName} roots={projection.roots} />;
}
