import { PartnerHomeStatus } from "@/components/partner/partner-facility-shell";
import { loadPartnerFacilityShell } from "@/lib/partner-operational-context";

export default async function PartnerFacilityHomePage() {
  const shell = await loadPartnerFacilityShell();
  return <PartnerHomeStatus shell={shell} />;
}
