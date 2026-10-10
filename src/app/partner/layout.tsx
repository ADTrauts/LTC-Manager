import { redirect } from "next/navigation";

import { PartnerFacilityShell } from "@/components/partner/partner-facility-shell";
import { getPartnerFacilitySession } from "@/lib/auth";
import { loadPartnerFacilityShell } from "@/lib/partner-operational-context";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const session = await getPartnerFacilitySession();
  if (!session) {
    redirect("/login");
  }
  const shell = await loadPartnerFacilityShell();
  return (
    <PartnerFacilityShell shell={shell} session={session}>
      {children}
    </PartnerFacilityShell>
  );
}
