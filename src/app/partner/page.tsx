import { unstable_noStore as noStore } from "next/cache";

import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import { PartnerDashboard } from "@/components/partner/partner-dashboard";
import { resolveDashboardViewer } from "@/lib/dashboard/viewer/resolve";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { loadPartnerDashboard } from "@/lib/partner-dashboard/load-partner-dashboard";
import { loadPartnerFacilityShell, requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { getPartnerFacilitySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type PartnerHomePageProps = {
  searchParams?: Promise<{
    onboarding?: string | string[] | undefined;
    scope?: string | string[] | undefined;
    edit?: string | string[] | undefined;
  }>;
};

export default async function PartnerFacilityHomePage({ searchParams }: PartnerHomePageProps) {
  noStore();
  const query = searchParams ? await searchParams : {};
  const context = await requirePartnerOperationalContext();
  const session = await getPartnerFacilitySession();
  const resolution =
    session && isContractedDepartmentAuthorityEnabled()
      ? await resolveDashboardViewer(session, {
          scopeParam: typeof query.scope === "string" ? query.scope : undefined,
        })
      : { kind: "not_eligible" as const, reason: "SESSION_KIND" as const };

  if (resolution.kind === "viewer" && resolution.viewer.scope) {
    return (
      <DashboardScreen
        viewer={resolution.viewer}
        onboardingComplete={query.onboarding === "complete"}
        editing={query.edit === "1"}
        homePath="/partner"
      />
    );
  }

  const shell = await loadPartnerFacilityShell();
  const departmentName =
    shell.departments.find((department) => department.id === context.activeDepartmentId)?.name ?? "Department";
  const view = await loadPartnerDashboard({
    client: prisma,
    context,
    departmentName,
  });
  return <PartnerDashboard view={view} />;
}
