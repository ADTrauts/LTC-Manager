import { HelpSupportPanel } from "@/components/help/help-support-panel";
import { requireFacilitySession } from "@/lib/facility-context";

export default async function HelpPage() {
  await requireFacilitySession();
  return <HelpSupportPanel />;
}
