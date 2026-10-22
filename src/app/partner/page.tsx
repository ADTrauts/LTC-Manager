import { unstable_noStore as noStore } from "next/cache";

import { PartnerDashboard } from "@/components/partner/partner-dashboard";
import { listEligibleCards } from "@/lib/dashboard/cards/eligibility";
import { resolveDepartmentDashboardCapabilities } from "@/lib/dashboard/capabilities";
import { resolveDashboardViewer } from "@/lib/dashboard/viewer/resolve";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { loadPartnerDashboard } from "@/lib/partner-dashboard/load-partner-dashboard";
import { loadPartnerFacilityShell, requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { getPartnerFacilitySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PartnerFacilityHomePage() {
  noStore();
  const context = await requirePartnerOperationalContext();
  const shell = await loadPartnerFacilityShell();
  const departmentName =
    shell.departments.find((department) => department.id === context.activeDepartmentId)?.name ?? "Department";
  const view = await loadPartnerDashboard({
    client: prisma,
    context,
    departmentName,
  });
  const session = await getPartnerFacilitySession();
  const resolution =
    session && isContractedDepartmentAuthorityEnabled()
      ? await resolveDashboardViewer(session)
      : { kind: "not_eligible" as const, reason: "SESSION_KIND" as const };
  const leaderCards =
    resolution.kind === "viewer"
      ? listEligibleCards(
          resolution.viewer,
          await resolveDepartmentDashboardCapabilities(resolution.viewer),
          undefined,
          { keepUnlinked: true },
        ).map((row) => ({
          id: row.card.id,
          title: row.card.title,
          question: row.card.question,
          reason: row.notConfigured?.message ?? null,
        }))
      : [];
  return <PartnerDashboard view={view} leaderCards={leaderCards} />;
}
