import { unstable_noStore as noStore } from "next/cache";

import { PartnerDashboard } from "@/components/partner/partner-dashboard";
import { loadPartnerDashboard } from "@/lib/partner-dashboard/load-partner-dashboard";
import { loadPartnerFacilityShell, requirePartnerOperationalContext } from "@/lib/partner-operational-context";
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
  return <PartnerDashboard view={view} />;
}
