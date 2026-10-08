import { PartnerFacilityShell } from "@/components/partner/partner-facility-shell";
import { loadPartnerFacilityShell } from "@/lib/partner-operational-context";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const shell = await loadPartnerFacilityShell();
  return <PartnerFacilityShell shell={shell}>{children}</PartnerFacilityShell>;
}
