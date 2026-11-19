import { redirect } from "next/navigation";

import { PartnerFacilityShell } from "@/components/partner/partner-facility-shell";
import { FacilityOperationsPauseBanner } from "@/components/facility-operations-pause-banner";
import { facilityOperationsAreSuspended } from "@/lib/facility-operations-suspension";
import { prisma } from "@/lib/prisma";
import { getPartnerFacilitySession } from "@/lib/auth";
import { loadPartnerFacilityShell } from "@/lib/partner-operational-context";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const session = await getPartnerFacilitySession();
  if (!session) {
    redirect("/login");
  }
  const shell = await loadPartnerFacilityShell();
  const suspended = await facilityOperationsAreSuspended(prisma, session.facilityId);
  return (
    <PartnerFacilityShell shell={shell} session={session}>
      {suspended ? <FacilityOperationsPauseBanner /> : null}
      {children}
    </PartnerFacilityShell>
  );
}
